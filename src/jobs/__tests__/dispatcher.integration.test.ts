import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { deriveJobId, dispatchOutboxBatch } from "@/jobs/dispatcher";
import { enqueueOutboxEvent } from "@/jobs/outbox";
import { MAINTENANCE_PING } from "@/jobs/processors/maintenance";
import { closeAllQueues, getQueue } from "@/jobs/queues";

describe.skipIf(!process.env.DATABASE_URL || !process.env.REDIS_URL)("outbox dispatcher (integration)", () => {
  const createdOutboxIds: string[] = [];
  const createdJobIds: string[] = [];

  afterAll(async () => {
    const queue = getQueue("maintenance");
    await Promise.all(
      createdJobIds.map(async (jobId) => {
        const job = await queue.getJob(jobId);
        await job?.remove();
      }),
    );
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await closeAllQueues();
  });

  it("dispatches a PENDING row to the maintenance queue with a deterministic jobId", async () => {
    const idempotencyKey = `test:${randomUUID()}`;
    const created = await enqueueOutboxEvent(prisma, {
      eventType: MAINTENANCE_PING,
      payload: { note: "integration test" },
      idempotencyKey,
    });
    createdOutboxIds.push(created.id);
    const jobId = deriveJobId(idempotencyKey);
    createdJobIds.push(jobId);

    const summary = await dispatchOutboxBatch(50);
    expect(summary.dispatched).toBeGreaterThanOrEqual(1);

    const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("DISPATCHED");
    expect(row.jobId).toBe(jobId);
    expect(row.dispatchedAt).not.toBeNull();

    const job = await getQueue("maintenance").getJob(jobId);
    expect(job).not.toBeNull();
    expect(job?.data).toEqual({ outboxId: created.id });
  });

  it("stays idempotent when a dispatch is effectively re-run (crash-retry simulation)", async () => {
    const idempotencyKey = `test:${randomUUID()}`;
    const created = await enqueueOutboxEvent(prisma, {
      eventType: MAINTENANCE_PING,
      payload: {},
      idempotencyKey,
    });
    createdOutboxIds.push(created.id);
    const jobId = deriveJobId(idempotencyKey);
    createdJobIds.push(jobId);

    await dispatchOutboxBatch(50);
    // Simulate a crash between the BullMQ add() succeeding and the PENDING->DISPATCHED commit:
    // force the row back to PENDING and dispatch again.
    await prisma.notificationOutbox.update({ where: { id: created.id }, data: { status: "PENDING" } });
    await dispatchOutboxBatch(50);

    const queue = getQueue("maintenance");
    const jobs = await queue.getJobs(["waiting", "delayed", "active", "completed", "failed"]);
    expect(jobs.filter((job) => job.id === jobId)).toHaveLength(1);

    const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("DISPATCHED");
  });

  it("marks a row with an unroutable event type FAILED instead of retrying forever", async () => {
    const idempotencyKey = `test:${randomUUID()}`;
    const created = await enqueueOutboxEvent(prisma, {
      eventType: "unknown.thing",
      payload: {},
      idempotencyKey,
    });
    createdOutboxIds.push(created.id);

    await dispatchOutboxBatch(50);

    const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("unknown.thing");
  });

  it("enqueueOutboxEvent upserts by idempotencyKey instead of creating duplicate rows", async () => {
    const idempotencyKey = `test:${randomUUID()}`;
    const first = await enqueueOutboxEvent(prisma, {
      eventType: MAINTENANCE_PING,
      payload: { attempt: 1 },
      idempotencyKey,
    });
    createdOutboxIds.push(first.id);

    const second = await enqueueOutboxEvent(prisma, {
      eventType: MAINTENANCE_PING,
      payload: { attempt: 2 },
      idempotencyKey,
    });

    expect(second.id).toBe(first.id);
    const count = await prisma.notificationOutbox.count({ where: { idempotencyKey } });
    expect(count).toBe(1);
  });
});
