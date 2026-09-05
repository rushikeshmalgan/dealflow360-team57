import { prisma } from "@/lib/db";
import type { JobProcessor } from "@/jobs/types";

/** Proves the outbox -> dispatcher -> BullMQ -> worker round trip without any business effect. */
export const MAINTENANCE_PING = "maintenance.ping";

export const maintenancePingProcessor: JobProcessor = async (job) => {
  const row = await prisma.notificationOutbox.findUnique({ where: { id: job.data.outboxId } });
  if (!row) {
    // The outbox row is the durable source of truth; if it's gone there is nothing to process.
    throw new Error(`Outbox row ${job.data.outboxId} not found for job ${job.id}`);
  }

  if (row.status === "SENT") {
    // A retried or duplicate-delivered job for a row a prior attempt already finished - no-op,
    // not a second side effect (TAD SS24A: workers must be idempotent).
    console.log("[maintenance.ping] already SENT, skipping", { outboxId: row.id, jobId: job.id });
    return;
  }

  console.log("[maintenance.ping] processing", { outboxId: row.id, jobId: job.id, payload: row.payload });

  await prisma.notificationOutbox.update({
    where: { id: row.id },
    data: { status: "SENT" },
  });
};

export const maintenanceProcessors: Record<string, JobProcessor> = {
  [MAINTENANCE_PING]: maintenancePingProcessor,
};
