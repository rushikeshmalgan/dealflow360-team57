import { randomUUID } from "node:crypto";

import type { Job } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { dealHealthService } from "@/modules/deal-health";
import { DEAL_HEALTH_EVALUATE_EVENT } from "@/modules/deal-health";
import { dealHealthEvaluateProcessor } from "@/jobs/processors/deal-health";
import type { OutboxJobData } from "@/jobs/types";

vi.mock("@/realtime/emit", () => ({ emitRealtimeEvent: vi.fn() }));

function fakeJob(outboxId: string): Job<OutboxJobData> {
  return { id: outboxId, name: DEAL_HEALTH_EVALUATE_EVENT, data: { outboxId } } as Job<OutboxJobData>;
}

/**
 * Worker retry/idempotency (TAD SS24A: "Duplicate/retried worker job ... one result is stored").
 * Mirrors src/jobs/__tests__/maintenance-processor.integration.test.ts's pattern: the outbox
 * row's own status is the idempotency gate, so a BullMQ retry that redelivers the same job after
 * the first attempt already finished must not re-run the (expensive, side-effecting) evaluation.
 */
describe.skipIf(!process.env.DATABASE_URL)("dealHealthEvaluateProcessor (integration)", () => {
  let quotationId: string;
  let salesRepId: string;
  let tierId: string;
  let customerId: string;
  let categoryId: string;
  let productId: string;
  let priceListId: string;
  const outboxIds: string[] = [];

  beforeAll(async () => {
    const suffix = randomUUID();
    const rep = await prisma.user.create({
      data: { passwordHash: "test-fixture", email: `jobrep+${suffix}@test.local`, role: "SALES_REP" },
    });
    salesRepId = rep.id;
    const tier = await prisma.customerTier.create({ data: { name: `Job-Tier-${suffix}` } });
    tierId = tier.id;
    const customer = await prisma.customer.create({ data: { name: `Job-Customer-${suffix}`, tierId } });
    customerId = customer.id;
    const category = await prisma.productCategory.create({ data: { name: `Job-Category-${suffix}` } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, sku: `JOB-SKU-${suffix}`, name: "Widget", price: "100.00", unit: "unit", taxPct: "0" },
    });
    productId = product.id;
    const priceList = await prisma.priceList.create({
      data: { name: `Job-PriceList-${suffix}`, tierId, currency: "USD" },
    });
    priceListId = priceList.id;

    const quotation = await prisma.quotation.create({
      data: { code: `JOB-${suffix}`, customerId, salesRepId, priceListId, status: "UNDER_NEGOTIATION" },
    });
    quotationId = quotation.id;
  });

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: outboxIds } } });
    await prisma.dealHealthAlert.deleteMany({ where: { quotationId } });
    await prisma.quotation.delete({ where: { id: quotationId } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.customerTier.delete({ where: { id: tierId } });
    await prisma.user.delete({ where: { id: salesRepId } });
  });

  it("evaluates once, marks the outbox SENT, and is a no-op on a redelivered (retried) job", async () => {
    const outbox = await prisma.notificationOutbox.create({
      data: {
        eventType: DEAL_HEALTH_EVALUATE_EVENT,
        payload: { quotationId },
        idempotencyKey: `test:${randomUUID()}`,
        status: "DISPATCHED",
      },
    });
    outboxIds.push(outbox.id);

    const evaluateSpy = vi.spyOn(dealHealthService, "evaluateQuotation");

    await dealHealthEvaluateProcessor(fakeJob(outbox.id));
    const afterFirst = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outbox.id } });
    expect(afterFirst.status).toBe("SENT");
    expect(evaluateSpy).toHaveBeenCalledTimes(1);

    // Simulate BullMQ redelivering the same job (a retry, or an at-least-once duplicate) after
    // the first attempt already completed.
    await dealHealthEvaluateProcessor(fakeJob(outbox.id));
    expect(evaluateSpy).toHaveBeenCalledTimes(1); // still 1 - the second call was skipped entirely

    evaluateSpy.mockRestore();
  });

  it("throws (so BullMQ retries) when the outbox row doesn't exist, rather than silently dropping the job", async () => {
    await expect(dealHealthEvaluateProcessor(fakeJob(randomUUID()))).rejects.toThrow(/not found/);
  });
});
