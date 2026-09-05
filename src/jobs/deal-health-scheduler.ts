import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { DEAL_HEALTH_CONFIG_V1, DEAL_HEALTH_EVALUATE_EVENT } from "@/modules/deal-health";
import type { DealHealthRepository } from "@/modules/deal-health";
import { PrismaDealHealthRepository } from "@/modules/deal-health/infrastructure/prisma-deal-health-repository";

import { enqueueOutboxEvent } from "./outbox";

const repository: DealHealthRepository = new PrismaDealHealthRepository();

/**
 * TAD SS34: "scheduled ... deal-health.evaluate job ... in bounded batches". Rather than one
 * big job doing everything, this fans a bounded batch of active quotations out into one durable
 * outbox row (and therefore one BullMQ job) per quotation - the exact same
 * `deal-health.evaluate` job the on-demand refresh path uses (src/jobs/processors/deal-health.ts),
 * so scheduled and on-demand evaluation share one implementation, one retry/backoff policy, and
 * one Redis-outage story (TAD SS24A/§45: the outbox row stays PENDING and is retried later).
 */
export async function scheduleDealHealthBatch(
  limit = DEAL_HEALTH_CONFIG_V1.batchSize,
): Promise<{ scheduled: number }> {
  const quotationIds = await repository.listActiveQuotationIds(limit);
  for (const quotationId of quotationIds) {
    // Each tick is a genuinely new evaluation request, not a retry of a prior one - a random
    // suffix keeps every tick's rows distinct rather than colliding with (and no-op'ing against)
    // an outbox row a previous tick already dispatched and finished.
    await enqueueOutboxEvent(prisma, {
      eventType: DEAL_HEALTH_EVALUATE_EVENT,
      payload: { quotationId },
      idempotencyKey: `deal-health:scheduled:${quotationId}:${randomUUID()}`,
    });
  }
  return { scheduled: quotationIds.length };
}

/** Runs scheduleDealHealthBatch on an interval for the worker process's lifetime. Mirrors
 * dispatcher.ts's startDispatcherLoop: guards against overlapping runs, returns a stop(). */
export function startDealHealthScheduler(intervalMs: number): () => void {
  let stopped = false;
  let running = false;

  const timer = setInterval(() => {
    if (stopped || running) return;
    running = true;
    scheduleDealHealthBatch()
      .then((result) => {
        if (result.scheduled > 0) {
          console.log("[deal-health-scheduler] batch scheduled", result);
        }
      })
      .catch((error) => {
        console.error("[deal-health-scheduler] batch failed", error);
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
