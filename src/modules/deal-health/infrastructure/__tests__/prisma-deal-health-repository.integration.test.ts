import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

import { DealHealthService } from "../../application/deal-health-service";
import { PrismaDealHealthRepository } from "../prisma-deal-health-repository";

vi.mock("@/realtime/emit", () => ({ emitRealtimeEvent: vi.fn() }));

/**
 * Real-Postgres coverage for the plumbing domain-level tests can't reach: the actual Prisma
 * joins in getSnapshot()/getRepDiscountHistory(), the (quotationId, type) unique constraint's
 * real idempotency behavior, and persistence surviving a fresh read. Rule logic itself (severity
 * bucketing, insufficient-history handling, etc.) is covered by the pure domain tests in
 * ../../domain/__tests__ - this file exists to catch a wrong join/query, not a wrong formula.
 */
describe.skipIf(!process.env.DATABASE_URL)("PrismaDealHealthRepository + DealHealthService (integration)", () => {
  const repository = new PrismaDealHealthRepository();
  const service = new DealHealthService(repository);

  let salesRepId: string;
  let managerId: string;
  let tierId: string;
  let categoryId: string;
  let productId: string;
  let priceListId: string;
  let customerId: string;
  const quotationIds: string[] = [];
  const extraUserIds: string[] = [];

  // lineDiscountPct here is a 0-100 percentage for test readability (matches every other
  // number in this file/the domain layer) - the DB column itself is a 0-1 fraction
  // (quotation_lines_line_discount_pct_range's check constraint), so it's divided by 100 here.
  async function createQuotation(
    opts: { unitPrice?: string; lineDiscountPct?: number; quantity?: number; salesRepId?: string } = {},
  ) {
    const suffix = randomUUID();
    const quotation = await prisma.quotation.create({
      data: {
        code: `DH-${suffix}`,
        customerId,
        salesRepId: opts.salesRepId ?? salesRepId,
        priceListId,
        status: "UNDER_NEGOTIATION",
        lines: {
          create: [
            {
              productId,
              quantity: opts.quantity ?? 1,
              unitPrice: opts.unitPrice ?? "1000.00",
              lineDiscountPct: ((opts.lineDiscountPct ?? 10) / 100).toString(),
            },
          ],
        },
      },
    });
    quotationIds.push(quotation.id);
    return quotation;
  }

  async function backdateUpdatedAt(quotationId: string, daysAgo: number) {
    // Prisma's @updatedAt always overwrites on .update(), so a raw statement is the only way to
    // simulate "this row hasn't been touched in N days" for the stalled-quotation rule.
    await prisma.$executeRaw`UPDATE quotations SET updated_at = NOW() - (${daysAgo}::text || ' days')::interval WHERE id = ${quotationId}::uuid`;
  }

  beforeAll(async () => {
    const suffix = randomUUID();
    const rep = await prisma.user.create({
      data: { clerkUserId: `test_rep_${suffix}`, email: `rep+${suffix}@test.local`, role: "SALES_REP" },
    });
    salesRepId = rep.id;
    const manager = await prisma.user.create({
      data: { clerkUserId: `test_mgr_${suffix}`, email: `mgr+${suffix}@test.local`, role: "MANAGER" },
    });
    managerId = manager.id;

    const tier = await prisma.customerTier.create({ data: { name: `DH-Tier-${suffix}` } });
    tierId = tier.id;
    const category = await prisma.productCategory.create({ data: { name: `DH-Category-${suffix}` } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, sku: `DH-SKU-${suffix}`, name: "Widget", price: "1000.00", unit: "unit", taxPct: "0" },
    });
    productId = product.id;
    const priceList = await prisma.priceList.create({
      data: { name: `DH-PriceList-${suffix}`, tierId, currency: "USD" },
    });
    priceListId = priceList.id;
    const customer = await prisma.customer.create({ data: { name: `DH-Customer-${suffix}`, tierId } });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.dealHealthAlert.deleteMany({ where: { quotationId: { in: quotationIds } } });
    await prisma.fulfillmentItem.deleteMany({ where: { fulfillment: { quotationId: { in: quotationIds } } } });
    await prisma.fulfillment.deleteMany({ where: { quotationId: { in: quotationIds } } });
    await prisma.negotiation.deleteMany({ where: { quotationId: { in: quotationIds } } });
    await prisma.approvalRecord.deleteMany({ where: { quotationVersion: { quotationId: { in: quotationIds } } } });
    await prisma.riskEvaluation.deleteMany({ where: { quotationVersion: { quotationId: { in: quotationIds } } } });
    await prisma.quotationVersion.deleteMany({ where: { quotationId: { in: quotationIds } } });
    await prisma.quotationLine.deleteMany({ where: { quotationId: { in: quotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: quotationIds } } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.customerTier.delete({ where: { id: tierId } });
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, managerId, ...extraUserIds] } } });
  });

  describe("stalled quotation: full lifecycle", () => {
    it("fires, is idempotent under a retry, resolves when activity resumes, and stays dismissed once acknowledged", async () => {
      const quotation = await createQuotation();
      await backdateUpdatedAt(quotation.id, 30);

      const first = await service.evaluateQuotation(quotation.id);
      expect(first?.status).toBe("critical");
      const alertsAfterFirst = await prisma.dealHealthAlert.findMany({ where: { quotationId: quotation.id } });
      const stalledRow = alertsAfterFirst.find((a) => a.type === "STALLED_QUOTATION");
      expect(stalledRow).toBeDefined();
      expect(stalledRow?.status).toBe("OPEN");
      expect(stalledRow?.severity).toBe("CRITICAL");
      const detectedAt = stalledRow!.detectedAt;

      // Duplicate evaluation (BullMQ retry / overlapping scheduled+on-demand run): must not
      // create a second row for the same (quotation, type), and must not reset detectedAt.
      await backdateUpdatedAt(quotation.id, 30);
      await service.evaluateQuotation(quotation.id);
      const alertsAfterRetry = await prisma.dealHealthAlert.findMany({
        where: { quotationId: quotation.id, type: "STALLED_QUOTATION" },
      });
      expect(alertsAfterRetry).toHaveLength(1);
      expect(alertsAfterRetry[0].detectedAt.getTime()).toBe(detectedAt.getTime());

      // Activity resumes (a real mutation, so Prisma's own @updatedAt bumps it) -> resolves.
      await prisma.quotation.update({ where: { id: quotation.id }, data: { version: { increment: 1 } } });
      const afterResume = await service.evaluateQuotation(quotation.id);
      expect(afterResume?.status).toBe("healthy");
      const resolvedRow = await prisma.dealHealthAlert.findUniqueOrThrow({
        where: { quotationId_type: { quotationId: quotation.id, type: "STALLED_QUOTATION" } },
      });
      expect(resolvedRow.status).toBe("RESOLVED");
      expect(resolvedRow.resolvedAt).not.toBeNull();

      // Goes stale again; a manager dismisses it; the evaluator must leave the dismissal alone
      // while the condition is still active (sticky dismissal).
      await backdateUpdatedAt(quotation.id, 30);
      await service.evaluateQuotation(quotation.id);
      const dismissed = await service.dismissAlert(
        { id: managerId, role: "MANAGER" },
        (
          await prisma.dealHealthAlert.findUniqueOrThrow({
            where: { quotationId_type: { quotationId: quotation.id, type: "STALLED_QUOTATION" } },
          })
        ).id,
      );
      expect(dismissed.status).toBe("DISMISSED");

      await service.evaluateQuotation(quotation.id);
      const stillDismissed = await prisma.dealHealthAlert.findUniqueOrThrow({
        where: { quotationId_type: { quotationId: quotation.id, type: "STALLED_QUOTATION" } },
      });
      expect(stillDismissed.status).toBe("DISMISSED");
    });

    it("never fires for a REJECTED quotation no matter how stale", async () => {
      const quotation = await createQuotation();
      await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "REJECTED" } });
      await backdateUpdatedAt(quotation.id, 90);

      const summary = await service.evaluateQuotation(quotation.id);
      expect(summary?.status).toBe("healthy");
      const row = await prisma.dealHealthAlert.findUnique({
        where: { quotationId_type: { quotationId: quotation.id, type: "STALLED_QUOTATION" } },
      });
      expect(row).toBeNull();
    });
  });

  describe("high-risk deal: real RiskEvaluation and ApprovalRecord joins", () => {
    it("surfaces a HIGH risk band from the latest QuotationVersion and fires the alert", async () => {
      const quotation = await createQuotation();
      const version = await prisma.quotationVersion.create({
        data: { quotationId: quotation.id, versionNo: 1, payload: {}, payloadHash: "hash" },
      });
      await prisma.riskEvaluation.create({
        data: { quotationVersionId: version.id, score: "85.00", band: "HIGH", explanation: {}, configVersion: 1 },
      });

      const summary = await service.evaluateQuotation(quotation.id);
      const alert = summary?.alerts.find((a) => a.type === "HIGH_RISK_DEAL");
      expect(alert).toBeDefined();
      expect(alert?.details).toMatchObject({ riskBand: "HIGH", riskScore: 85 });
    });

    it("surfaces an overdue PENDING Finance approval age from a real ApprovalRecord", async () => {
      const quotation = await createQuotation();
      const version = await prisma.quotationVersion.create({
        data: { quotationId: quotation.id, versionNo: 1, payload: {}, payloadHash: "hash" },
      });
      const record = await prisma.approvalRecord.create({
        data: { quotationVersionId: version.id, stepOrder: 1, role: "FINANCE_OPS", status: "PENDING" },
      });
      await prisma.$executeRaw`UPDATE approval_records SET created_at = NOW() - INTERVAL '4 days' WHERE id = ${record.id}::uuid`;

      const summary = await service.evaluateQuotation(quotation.id);
      const alert = summary?.alerts.find((a) => a.type === "HIGH_RISK_DEAL");
      expect(alert).toBeDefined();
      expect(alert?.details).toMatchObject({ riskBand: null, reasons: ["FINANCE_APPROVAL_OVERDUE"] });
    });
  });

  describe("delivery slippage: real Fulfillment + Negotiation join", () => {
    it("fires when the fulfillment's worst estimate exceeds the accepted negotiation's requested delivery date", async () => {
      const quotation = await createQuotation();
      const promisedDate = new Date("2026-01-01T00:00:00.000Z");
      await prisma.negotiation.create({
        data: {
          quotationId: quotation.id,
          customerId,
          status: "ACCEPTED",
          requestedDeliveryDate: promisedDate,
        },
      });
      const fulfillment = await prisma.fulfillment.create({
        data: { quotationId: quotation.id, idempotencyKey: `dh-${quotation.id}` },
      });
      const line = await prisma.quotationLine.findFirstOrThrow({ where: { quotationId: quotation.id } });
      const warehouse = await prisma.warehouse.create({ data: { name: `DH-Warehouse-${quotation.id}` } });
      await prisma.fulfillmentItem.create({
        data: {
          fulfillmentId: fulfillment.id,
          quotationLineId: line.id,
          warehouseId: warehouse.id,
          productId,
          allocatedQty: 1,
          estShipmentDate: new Date("2026-01-20T00:00:00.000Z"), // 19 days late
        },
      });

      const summary = await service.evaluateQuotation(quotation.id);
      const alert = summary?.alerts.find((a) => a.type === "DELIVERY_SLIPPAGE");
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe("CRITICAL");
      expect(alert?.details).toMatchObject({ daysLate: 19 });

      await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: fulfillment.id } });
      await prisma.fulfillment.delete({ where: { id: fulfillment.id } });
      await prisma.warehouse.delete({ where: { id: warehouse.id } });
    });
  });

  describe("discount anomaly: real rep-history lookup", () => {
    it("does not alert with fewer than the minimum historical samples, then fires once enough history exists", async () => {
      // A dedicated rep, isolated from every other test's quotations in this file - the rule
      // reads *all* of a rep's other quotations as history, so sharing salesRepId with the
      // stalled/high-risk/delivery tests above would silently satisfy "enough history" before
      // this test's own fixture data does.
      const suffix = randomUUID();
      const discountRep = await prisma.user.create({
        data: { clerkUserId: `test_dh_${suffix}`, email: `dhrep+${suffix}@test.local`, role: "SALES_REP" },
      });
      extraUserIds.push(discountRep.id);

      const target = await createQuotation({ lineDiscountPct: 40, salesRepId: discountRep.id });

      let summary = await service.evaluateQuotation(target.id);
      expect(summary?.alerts.find((a) => a.type === "DISCOUNT_ANOMALY")).toBeUndefined();

      // Give this rep 5 other quotations at a stable ~10% discount to form a baseline.
      for (let i = 0; i < 5; i += 1) {
        await createQuotation({ lineDiscountPct: 10, salesRepId: discountRep.id });
      }

      summary = await service.evaluateQuotation(target.id);
      const alert = summary?.alerts.find((a) => a.type === "DISCOUNT_ANOMALY");
      expect(alert).toBeDefined();
      expect(alert?.details).toMatchObject({ baselineMeanPct: 10, currentDiscountPct: 40 });
    });
  });

  describe("authorization surface with real data", () => {
    it("scopes GET-style listAlerts to the Sales Rep's own quotations against real rows", async () => {
      const quotation = await createQuotation();
      await backdateUpdatedAt(quotation.id, 30);
      await service.evaluateQuotation(quotation.id);

      const asRep = await service.listAlerts({ id: salesRepId, role: "SALES_REP" }, {});
      expect(asRep.every((a) => a.salesRepId === salesRepId)).toBe(true);
      expect(asRep.some((a) => a.quotationId === quotation.id)).toBe(true);

      const asOtherRep = await service.listAlerts({ id: randomUUID(), role: "SALES_REP" }, {});
      expect(asOtherRep.some((a) => a.quotationId === quotation.id)).toBe(false);
    });
  });
});
