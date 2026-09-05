import { randomUUID } from "node:crypto";

import type { Job } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { MAINTENANCE_PING, maintenancePingProcessor } from "@/jobs/processors/maintenance";
import type { OutboxJobData } from "@/jobs/types";

function fakeJob(outboxId: string): Job<OutboxJobData> {
  return { id: outboxId, name: MAINTENANCE_PING, data: { outboxId } } as Job<OutboxJobData>;
}

describe.skipIf(!process.env.DATABASE_URL)("maintenance.ping processor (integration)", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: createdIds } } });
  });

  it("marks a DISPATCHED row SENT after processing", async () => {
    const idempotencyKey = `test:${randomUUID()}`;
    const row = await prisma.notificationOutbox.create({
      data: { eventType: MAINTENANCE_PING, payload: {}, idempotencyKey, status: "DISPATCHED", jobId: idempotencyKey },
    });
    createdIds.push(row.id);

    await maintenancePingProcessor(fakeJob(row.id));

    const after = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("SENT");
  });

  it("is a no-op for a duplicate/retried delivery of an already-SENT row", async () => {
    const idempotencyKey = `test:${randomUUID()}`;
    const row = await prisma.notificationOutbox.create({
      data: { eventType: MAINTENANCE_PING, payload: {}, idempotencyKey, status: "SENT", jobId: idempotencyKey },
    });
    createdIds.push(row.id);

    await expect(maintenancePingProcessor(fakeJob(row.id))).resolves.toBeUndefined();

    const after = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("SENT");
  });

  it("throws when the outbox row is missing so BullMQ can retry rather than silently dropping the job", async () => {
    await expect(maintenancePingProcessor(fakeJob(randomUUID()))).rejects.toThrow(/not found/);
  });
});
