import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getQueue } from "@/jobs/queues";
import { resolveQueueName } from "@/jobs/registry";
import type { OutboxJobData } from "@/jobs/types";

const DEFAULT_BATCH_SIZE = 10;
const JOB_ATTEMPTS = 5;
const JOB_BACKOFF_DELAY_MS = 2000;
const DISPATCH_RETRY_BASE_MS = 2000;
const DISPATCH_RETRY_MAX_MS = 60_000;
// Bounds the interactive transaction below: batchSize rows x a fail-fast Redis call each, plus
// margin. Keep this and DEFAULT_BATCH_SIZE in sync if either changes.
const TRANSACTION_TIMEOUT_MS = 15_000;

type ClaimedRow = {
  id: string;
  event_type: string;
  idempotency_key: string;
  attempts: number;
};

export type DispatchSummary = {
  claimed: number;
  dispatched: number;
  retried: number;
  failed: number;
};

function computeNextAttemptAt(attemptsAfterThisOne: number): Date {
  const delay = Math.min(DISPATCH_RETRY_BASE_MS * 2 ** attemptsAfterThisOne, DISPATCH_RETRY_MAX_MS);
  return new Date(Date.now() + delay);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * outbox.idempotencyKey is a free-form, caller-supplied business key (up to 200 chars, any
 * characters) - but BullMQ rejects custom job IDs containing ":". Hashing it gives a
 * deterministic, BullMQ-safe jobId: the same idempotencyKey always produces the same jobId, so
 * re-dispatching the same row (including the crash-retry window) still hits the same BullMQ job.
 */
export function deriveJobId(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

/**
 * One outbox dispatch pass (TAD SS24A). Claims PENDING rows (due now, oldest first) with
 * `FOR UPDATE SKIP LOCKED` so a second concurrent dispatcher run never double-claims a row,
 * hands each to BullMQ with a deterministic jobId (the row's own idempotencyKey), and only
 * marks it DISPATCHED once that queue insertion has actually succeeded.
 *
 * If Redis is unreachable, the producer connection fails fast (lib/redis.ts), the row is left
 * PENDING with an exponential backoff, and the next scheduled pass retries it - the API request
 * that originally wrote the row already committed and returned, independent of this.
 *
 * This dispatcher runs as a single instance (one BullMQ worker process per TAD SS3), so holding
 * the row locks for the short, fail-fast Redis calls inside one transaction is safe and keeps
 * "claim" and "mark dispatched" atomic without a separate in-flight status to manage.
 */
export async function dispatchOutboxBatch(batchSize = DEFAULT_BATCH_SIZE): Promise<DispatchSummary> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
        SELECT id, event_type, idempotency_key, attempts
        FROM notification_outbox
        WHERE status = 'PENDING'
          AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `);

      const summary: DispatchSummary = { claimed: rows.length, dispatched: 0, retried: 0, failed: 0 };

      for (const row of rows) {
        let queueName;
        try {
          queueName = resolveQueueName(row.event_type);
        } catch (error) {
          // Not a transient failure - this event type will never route. Fail it now instead of
          // retrying forever.
          await tx.notificationOutbox.update({
            where: { id: row.id },
            data: { status: "FAILED", attempts: { increment: 1 }, lastError: sanitizeError(error) },
          });
          summary.failed += 1;
          continue;
        }

        try {
          const jobData: OutboxJobData = { outboxId: row.id };
          const jobId = deriveJobId(row.idempotency_key);
          const job = await getQueue(queueName).add(row.event_type, jobData, {
            jobId,
            attempts: JOB_ATTEMPTS,
            backoff: { type: "exponential", delay: JOB_BACKOFF_DELAY_MS },
          });

          await tx.notificationOutbox.update({
            where: { id: row.id },
            data: {
              status: "DISPATCHED",
              dispatchedAt: new Date(),
              jobId: job.id ?? jobId,
              attempts: { increment: 1 },
            },
          });
          summary.dispatched += 1;
        } catch (error) {
          // Redis unavailable or another producer-side failure: leave PENDING for the next pass.
          await tx.notificationOutbox.update({
            where: { id: row.id },
            data: {
              attempts: { increment: 1 },
              nextAttemptAt: computeNextAttemptAt(row.attempts + 1),
              lastError: sanitizeError(error),
            },
          });
          summary.retried += 1;
        }
      }

      return summary;
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

/**
 * Runs dispatchOutboxBatch on an interval for the lifetime of the worker process. Guards
 * against overlapping runs (a slow pass never causes a second one to start) and returns a
 * `stop()` for graceful shutdown.
 */
export function startDispatcherLoop(intervalMs: number): () => void {
  let stopped = false;
  let running = false;

  const timer = setInterval(() => {
    if (stopped || running) return;
    running = true;
    dispatchOutboxBatch()
      .then((summary) => {
        if (summary.claimed > 0) {
          console.log("[dispatcher] batch", summary);
        }
      })
      .catch((error) => {
        console.error("[dispatcher] batch failed", error);
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  return function stop() {
    stopped = true;
    clearInterval(timer);
  };
}
