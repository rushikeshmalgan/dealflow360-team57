import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/shared/domain/actor";

import { PrismaFulfillmentRepository } from "../prisma-fulfillment-repository";

/**
 * Hits the real dev Postgres, matching every other *.integration.test.ts in this codebase
 * (e.g. prisma-quotation-repository.integration.test.ts) — this is the only way to exercise the
 * transactional stock-reservation math, optimistic-version locking, and the full documented
 * lifecycle transitions (docs/ORDERS_FLOW.md §2) for real.
 */
describe.skipIf(!process.env.DATABASE_URL)("PrismaFulfillmentRepository (integration)", () => {
  const repository = new PrismaFulfillmentRepository();
  let actor: Actor;
  let tierId: string;
  let customerId: string;
  let categoryId: string;
  let priceListId: string;
  let warehouseA: string;
  let warehouseB: string;

  const cleanupQuotationIds: string[] = [];
  const cleanupProductIds: string[] = [];

  beforeAll(async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { passwordHash: "test-fixture", email: `f_rep+${suffix}@test.local`, role: "SALES_REP" },
    });
    actor = { id: user.id, role: "SALES_REP" };

    const tier = await prisma.customerTier.create({ data: { name: `F-Test-Tier-${suffix}` } });
    tierId = tier.id;
    const customer = await prisma.customer.create({ data: { name: `F-Test-Customer-${suffix}`, tierId } });
    customerId = customer.id;
    const category = await prisma.productCategory.create({ data: { name: `F-Test-Category-${suffix}` } });
    categoryId = category.id;

    const whA = await prisma.warehouse.create({
      data: { name: `F-Test-Warehouse-A-${suffix}`, shippingCostWeight: "1" },
    });
    const whB = await prisma.warehouse.create({
      data: { name: `F-Test-Warehouse-B-${suffix}`, shippingCostWeight: "2" },
    });
    warehouseA = whA.id;
    warehouseB = whB.id;

    const priceList = await prisma.priceList.create({
      data: { name: `F-Test-PriceList-${suffix}`, tierId, currency: "USD" },
    });
    priceListId = priceList.id;
  });

  afterAll(async () => {
    const fulfillments = await prisma.fulfillment.findMany({
      where: { quotationId: { in: cleanupQuotationIds } },
      select: { id: true },
    });
    const fulfillmentIds = fulfillments.map((f) => f.id);
    await prisma.stockReservation.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
    await prisma.backorder.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
    await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...cleanupQuotationIds, ...fulfillmentIds] } },
    });
    await prisma.fulfillment.deleteMany({ where: { quotationId: { in: cleanupQuotationIds } } });
    await prisma.quotationLine.deleteMany({ where: { quotationId: { in: cleanupQuotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: cleanupQuotationIds } } });
    await prisma.warehouseStock.deleteMany({ where: { productId: { in: cleanupProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: cleanupProductIds } } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.warehouse.deleteMany({ where: { id: { in: [warehouseA, warehouseB] } } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.customerTier.delete({ where: { id: tierId } });
    await prisma.user.delete({ where: { id: actor.id } });
  });

  async function makeProduct(suffixLabel: string) {
    const product = await prisma.product.create({
      data: {
        categoryId,
        sku: `F-SKU-${suffixLabel}-${randomUUID()}`,
        name: `Test Product ${suffixLabel}`,
        price: "100.00",
        costPrice: "60.00",
        unit: "unit",
        taxPct: "0",
      },
    });
    cleanupProductIds.push(product.id);
    return product.id;
  }

  async function stockUp(warehouseId: string, productId: string, availableQty: number, reservedQty = 0) {
    await prisma.warehouseStock.create({
      data: { warehouseId, productId, availableQty, reservedQty },
    });
  }

  async function makeConfirmedQuotation(lines: { productId: string; quantity: number }[]) {
    const quotation = await prisma.quotation.create({
      data: {
        code: `F-QT-${randomUUID()}`,
        customerId,
        salesRepId: actor.id,
        priceListId,
        status: "CONFIRMED",
        lines: {
          create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: "100.00" })),
        },
      },
    });
    cleanupQuotationIds.push(quotation.id);
    return quotation.id;
  }

  describe("listOrders / getOrder visibility", () => {
    it("only lists quotations in a fulfillment-visible status", async () => {
      const productId = await makeProduct("visibility");
      const confirmedId = await makeConfirmedQuotation([{ productId, quantity: 1 }]);
      const draft = await prisma.quotation.create({
        data: { code: `F-QT-${randomUUID()}`, customerId, salesRepId: actor.id, priceListId, status: "DRAFT" },
      });
      cleanupQuotationIds.push(draft.id);

      const list = await repository.listOrders();
      const ids = list.map((o) => o.id);
      expect(ids).toContain(confirmedId);
      expect(ids).not.toContain(draft.id);
    });

    it("returns null for a non-visible status and for an unknown id", async () => {
      const draft = await prisma.quotation.create({
        data: { code: `F-QT-${randomUUID()}`, customerId, salesRepId: actor.id, priceListId, status: "DRAFT" },
      });
      cleanupQuotationIds.push(draft.id);

      expect(await repository.getOrder(draft.id)).toBeNull();
      expect(await repository.getOrder(randomUUID())).toBeNull();
    });
  });

  describe("getOrder — live-computed suggestion (no Fulfillment row yet)", () => {
    it("reports PENDING (no split needed) when one warehouse covers the whole order", async () => {
      const productId = await makeProduct("single-wh");
      await stockUp(warehouseA, productId, 50);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);

      const order = await repository.getOrder(quotationId);
      expect(order!.fulfillmentStatus).toBe("PENDING");
      expect(order!.suggestedSplit).toHaveLength(1);
      expect(order!.suggestedSplit[0]).toMatchObject({ warehouseId: warehouseA, quantity: 10 });
    });

    it("reports SPLIT_PROPOSED and a multi-warehouse suggestion when no single warehouse covers it", async () => {
      const productId = await makeProduct("multi-wh");
      await stockUp(warehouseA, productId, 6);
      await stockUp(warehouseB, productId, 9);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);

      const order = await repository.getOrder(quotationId);
      expect(order!.fulfillmentStatus).toBe("SPLIT_PROPOSED");
      const total = order!.suggestedSplit.reduce((sum, s) => sum + s.quantity, 0);
      expect(total).toBe(10);
      expect(order!.suggestedSplit.length).toBeGreaterThanOrEqual(1);
    });

    it("is side-effect-free — repeated reads never create a Fulfillment row", async () => {
      const productId = await makeProduct("readonly");
      await stockUp(warehouseA, productId, 50);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 5 }]);

      await repository.getOrder(quotationId);
      await repository.getOrder(quotationId);

      const fulfillment = await prisma.fulfillment.findUnique({ where: { quotationId } });
      expect(fulfillment).toBeNull();
    });
  });

  describe("acceptSuggestedSplit", () => {
    it("rejects a quotation that is not Confirmed", async () => {
      const productId = await makeProduct("not-confirmed");
      const draft = await prisma.quotation.create({
        data: { code: `F-QT-${randomUUID()}`, customerId, salesRepId: actor.id, priceListId, status: "DRAFT" },
      });
      cleanupQuotationIds.push(draft.id);
      await stockUp(warehouseA, productId, 10);

      await expect(repository.acceptSuggestedSplit(draft.id, actor)).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      });
    });

    it("fully allocates from a single warehouse, reserves stock, and moves the order to FULFILLMENT/ALLOCATED", async () => {
      const productId = await makeProduct("accept-full");
      await stockUp(warehouseA, productId, 20);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);

      const order = await repository.acceptSuggestedSplit(quotationId, actor);

      expect(order.orderStatus).toBe("FULFILLMENT");
      expect(order.fulfillmentStatus).toBe("ALLOCATED");
      expect(order.backorders).toHaveLength(0);
      expect(order.lines[0]).toMatchObject({ allocatedQty: 10, lineStatus: "ALLOCATED" });

      const stock = await prisma.warehouseStock.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId: warehouseA, productId } },
      });
      expect(stock.reservedQty).toBe(10);

      const reservation = await prisma.stockReservation.findFirst({ where: { productId } });
      expect(reservation).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { action: "ACCEPT_SUGGESTED_SPLIT" } });
      expect(audit).not.toBeNull();
    });

    it("creates a Backorder and PARTIALLY_ALLOCATED status when stock falls short", async () => {
      const productId = await makeProduct("accept-partial");
      await stockUp(warehouseA, productId, 4);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);

      const order = await repository.acceptSuggestedSplit(quotationId, actor);

      expect(order.fulfillmentStatus).toBe("PARTIALLY_ALLOCATED");
      expect(order.backorders).toHaveLength(1);
      expect(order.backorders[0]).toMatchObject({ remainingQty: 6, status: "OPEN" });
      expect(order.lines[0].lineStatus).toBe("BACKORDERED");
    });

    it("creates a fully BACKORDERED fulfillment when there is no stock anywhere", async () => {
      const productId = await makeProduct("accept-none");
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 5 }]);

      const order = await repository.acceptSuggestedSplit(quotationId, actor);

      expect(order.fulfillmentStatus).toBe("BACKORDERED");
      expect(order.backorders[0]).toMatchObject({ remainingQty: 5, status: "OPEN" });
    });

    it("rejects accepting a split twice for the same order", async () => {
      const productId = await makeProduct("accept-twice");
      await stockUp(warehouseA, productId, 10);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 5 }]);

      await repository.acceptSuggestedSplit(quotationId, actor);
      // The first accept already moved the quotation to FULFILLMENT, so the second call fails
      // the "must be Confirmed" guard before it would even reach the "already has a Fulfillment
      // row" (ALREADY_ACTIONED) guard — both are valid rejections of the same repeat attempt.
      await expect(repository.acceptSuggestedSplit(quotationId, actor)).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      });
    });
  });

  describe("overrideSplit", () => {
    it("rejects an order with more than one distinct product", async () => {
      const productA = await makeProduct("override-multi-a");
      const productB = await makeProduct("override-multi-b");
      await stockUp(warehouseA, productA, 10);
      await stockUp(warehouseA, productB, 10);
      const quotationId = await makeConfirmedQuotation([
        { productId: productA, quantity: 5 },
        { productId: productB, quantity: 5 },
      ]);

      await expect(
        repository.overrideSplit(quotationId, { splits: [{ warehouseId: warehouseA, quantity: 10 }] }, actor),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects quantities that don't sum to the full ordered amount", async () => {
      const productId = await makeProduct("override-sum");
      await stockUp(warehouseA, productId, 10);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);

      await expect(
        repository.overrideSplit(quotationId, { splits: [{ warehouseId: warehouseA, quantity: 5 }] }, actor),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects allocating more than a warehouse's free stock", async () => {
      const productId = await makeProduct("override-insufficient");
      await stockUp(warehouseA, productId, 3);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 3 }]);

      await expect(
        repository.overrideSplit(quotationId, { splits: [{ warehouseId: warehouseA, quantity: 3 }, ], }, actor),
      ).resolves.toBeDefined();

      // Second order over-requesting the now-reserved stock must fail.
      const quotationId2 = await makeConfirmedQuotation([{ productId, quantity: 1 }]);
      await expect(
        repository.overrideSplit(quotationId2, { splits: [{ warehouseId: warehouseA, quantity: 1 }] }, actor),
      ).rejects.toMatchObject({ code: "CONFIGURATION_CONFLICT" });
    });

    it("applies a valid override across two warehouses and fully allocates", async () => {
      const productId = await makeProduct("override-valid");
      await stockUp(warehouseA, productId, 10);
      await stockUp(warehouseB, productId, 10);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);

      const order = await repository.overrideSplit(
        quotationId,
        { splits: [{ warehouseId: warehouseA, quantity: 6 }, { warehouseId: warehouseB, quantity: 4 }] },
        actor,
      );

      expect(order.fulfillmentStatus).toBe("ALLOCATED");
      expect(order.backorders).toHaveLength(0);
      const stockA = await prisma.warehouseStock.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId: warehouseA, productId } },
      });
      const stockB = await prisma.warehouseStock.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId: warehouseB, productId } },
      });
      expect(stockA.reservedQty).toBe(6);
      expect(stockB.reservedQty).toBe(4);

      const audit = await prisma.auditLog.findFirst({ where: { action: "MANUAL_OVERRIDE" } });
      expect(audit).not.toBeNull();
    });
  });

  describe("markShipped", () => {
    it("rejects shipping an order that has not been allocated yet", async () => {
      const productId = await makeProduct("ship-not-allocated");
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 1 }]);
      await expect(repository.markShipped(quotationId, actor)).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      });
    });

    it("rejects shipping while a backorder remains open", async () => {
      const productId = await makeProduct("ship-open-backorder");
      await stockUp(warehouseA, productId, 2);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 5 }]);
      await repository.acceptSuggestedSplit(quotationId, actor);

      await expect(repository.markShipped(quotationId, actor)).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      });
    });

    it("ships a fully-allocated order: decrements stock, sets Fulfillment SHIPPED and Quotation BILLING", async () => {
      const productId = await makeProduct("ship-full");
      await stockUp(warehouseA, productId, 10);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);
      await repository.acceptSuggestedSplit(quotationId, actor);

      const shipped = await repository.markShipped(quotationId, actor);

      expect(shipped.fulfillmentStatus).toBe("SHIPPED");
      expect(shipped.orderStatus).toBe("BILLING");

      const stock = await prisma.warehouseStock.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId: warehouseA, productId } },
      });
      expect(stock.availableQty).toBe(0);
      expect(stock.reservedQty).toBe(0);

      const audit = await prisma.auditLog.findFirst({ where: { action: "SHIP" } });
      expect(audit).not.toBeNull();
    });

    it("rejects shipping an order that has already shipped", async () => {
      const productId = await makeProduct("ship-twice");
      await stockUp(warehouseA, productId, 10);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);
      await repository.acceptSuggestedSplit(quotationId, actor);
      await repository.markShipped(quotationId, actor);

      await expect(repository.markShipped(quotationId, actor)).rejects.toMatchObject({
        code: "ALREADY_ACTIONED",
      });
    });
  });

  describe("billing linkage", () => {
    it("surfaces an existing invoice's status and paid amount as the billing summary", async () => {
      const productId = await makeProduct("billing");
      await stockUp(warehouseA, productId, 10);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);
      await repository.acceptSuggestedSplit(quotationId, actor);
      await repository.markShipped(quotationId, actor);

      const invoice = await prisma.invoice.create({
        data: {
          invoiceCode: `F-INV-${randomUUID()}`,
          customerId,
          quotationId,
          status: "ISSUED",
          totalAmount: "1000.00",
          currency: "USD",
        },
      });
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: "400.00",
          idempotencyKey: `f-pay-${randomUUID()}`,
          recordedByUserId: actor.id,
        },
      });

      const order = await repository.getOrder(quotationId);
      expect(order!.billing).toMatchObject({
        invoiceCode: invoice.invoiceCode,
        status: "ISSUED",
        totalAmount: "1000.00",
        paidAmount: "400.00",
      });

      await prisma.payment.deleteMany({ where: { invoiceId: invoice.id } });
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });

    it("returns null billing when no invoice has been generated yet", async () => {
      const productId = await makeProduct("no-billing");
      await stockUp(warehouseA, productId, 5);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 5 }]);

      const order = await repository.getOrder(quotationId);
      expect(order!.billing).toBeNull();
    });
  });

  describe("timeline", () => {
    it("includes accept-split and ship events in chronological order", async () => {
      const productId = await makeProduct("timeline");
      await stockUp(warehouseA, productId, 10);
      const quotationId = await makeConfirmedQuotation([{ productId, quantity: 10 }]);
      await repository.acceptSuggestedSplit(quotationId, actor);
      await repository.markShipped(quotationId, actor);

      const order = await repository.getOrder(quotationId);
      const actions = order!.timeline.map((t) => t.action);
      expect(actions).toContain("Warehouse split accepted");
      expect(actions).toContain("Order shipped");
      expect(new Date(order!.timeline[0].createdAt).getTime()).toBeLessThanOrEqual(
        new Date(order!.timeline.at(-1)!.createdAt).getTime(),
      );
    });
  });
});
