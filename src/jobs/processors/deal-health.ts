import { z } from "zod";

import { prisma } from "@/lib/db";
import { dealHealthService } from "@/modules/deal-health";
import { DEAL_HEALTH_EVALUATE_EVENT } from "@/modules/deal-health";
import type { JobProcessor } from "@/jobs/types";

const payloadSchema = z.object({ quotationId: z.string().uuid() });

/**
 * TAD SS34: "load authoritative PostgreSQL data, evaluate configured rules, create/update/
 * resolve alerts". Same outbox-mediated shape as maintenance.ping (TAD SS24A) - job data is
 * `{outboxId}` only; the actual quotationId lives in the outbox row's payload, reloaded from
 * Postgres here rather than trusted from Redis. Used for both the on-demand refresh path
 * (src/modules/deal-health/application/deal-health-service.ts's refreshQuotation, one outbox
 * row per click) and the scheduled batch fan-out (src/jobs/deal-health-scheduler.ts, one outbox
 * row per quotation per tick) - always exactly one quotation per job.
 */
export const dealHealthEvaluateProcessor: JobProcessor = async (job) => {
  const row = await prisma.notificationOutbox.findUnique({ where: { id: job.data.outboxId } });
  if (!row) {
    throw new Error(`Outbox row ${job.data.outboxId} not found for job ${job.id}`);
  }

  if (row.status === "SENT") {
    // Duplicate delivery of an already-finished job - the alert upsert is idempotent anyway,
    // but skip the extra work (TAD SS24A: workers must be idempotent).
    console.log("[deal-health.evaluate] already SENT, skipping", { outboxId: row.id, jobId: job.id });
    return;
  }

  const { quotationId } = payloadSchema.parse(row.payload);
  const summary = await dealHealthService.evaluateQuotation(quotationId);
  console.log("[deal-health.evaluate] processed", {
    outboxId: row.id,
    jobId: job.id,
    quotationId,
    status: summary?.status ?? "quotation-not-found",
    openAlerts: summary?.alerts.filter((alert) => alert.status === "OPEN").length ?? 0,
  });

  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "SENT" } });
};

export const dealHealthProcessors: Record<string, JobProcessor> = {
  [DEAL_HEALTH_EVALUATE_EVENT]: dealHealthEvaluateProcessor,
};
