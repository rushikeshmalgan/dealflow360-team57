import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/shared/domain/actor";

import { RecommendationService } from "../../application/recommendation-service";
import { PrismaRecommendationRepository } from "../prisma-recommendation-repository";

vi.mock("@/realtime/emit", () => ({ emitRealtimeEvent: vi.fn() }));

/**
 * Real-Postgres coverage for the joins/aggregations pure domain tests can't reach: co-occurrence
 * counting across historical quotations, active-DiscountRule promotion matching, warehouse stock
 * aggregation, tier-affinity history, the sticky PENDING/ADDED/DISMISSED upsert behavior, and a
 * full generate -> add-to-quote -> dismiss lifecycle against a real Quotation (via the same
 * QuotationService.addLine path production uses). Scoring formula correctness itself is covered
 * by the pure domain tests in ../../domain/__tests__.
 */
describe.skipIf(!process.env.DATABASE_URL)("PrismaRecommendationRepository + RecommendationService (integration)", () => {
  const repository = new PrismaRecommendationRepository();
  const service = new RecommendationService(repository);

  let salesRepId: string;
  let tierId: string;
  let otherTierId: string;
  let categoryA: string;
  let categoryB: string;
  let anchorProductId: string;
  let highMarginProductId: string;
  let upsellProductId: string;
  let lowMarginProductId: string;
  let outOfStockProductId: string;
  let priceListId: string;
  let customerId: string;
  let warehouseId: string;
  const quotationIds: string[] = [];
  const extraCustomerIds: string[] = [];
  const extraQuotationIds: string[] = [];

  let rep: Actor;

  beforeAll(async () => {
    const suffix = randomUUID();
    const repUser = await prisma.user.create({
      data: { passwordHash: "test-fixture", email: `rec-rep+${suffix}@test.local`, role: "SALES_REP" },
    });
    salesRepId = repUser.id;
    rep = { id: salesRepId, role: "SALES_REP" };

    const tier = await prisma.customerTier.create({ data: { name: `REC-Tier-${suffix}` } });
    tierId = tier.id;
    const otherTier = await prisma.customerTier.create({ data: { name: `REC-OtherTier-${suffix}` } });
    otherTierId = otherTier.id;

    const catA = await prisma.productCategory.create({ data: { name: `REC-CategoryA-${suffix}` } });
    categoryA = catA.id;
    const catB = await prisma.productCategory.create({ data: { name: `REC-CategoryB-${suffix}` } });
    categoryB = catB.id;

    const anchor = await prisma.product.create({
      data: { categoryId: categoryA, sku: `REC-ANCHOR-${suffix}`, name: "Anchor Widget", price: "100.00", costPrice: "60.00", unit: "unit", taxPct: "0" },
    });
    anchorProductId = anchor.id;

    const highMargin = await prisma.product.create({
      data: { categoryId: categoryB, sku: `REC-HIGHMARGIN-${suffix}`, name: "High Margin Addon", price: "200.00", costPrice: "50.00", unit: "unit", taxPct: "0" },
    });
    highMarginProductId = highMargin.id;

    const upsell = await prisma.product.create({
      data: { categoryId: categoryA, sku: `REC-UPSELL-${suffix}`, name: "Bigger Widget", price: "150.00", costPrice: "60.00", unit: "unit", taxPct: "0" },
    });
    upsellProductId = upsell.id;

    const lowMargin = await prisma.product.create({
      data: { categoryId: categoryB, sku: `REC-LOWMARGIN-${suffix}`, name: "Thin Margin Addon", price: "100.00", costPrice: "95.00", unit: "unit", taxPct: "0" },
    });
    lowMarginProductId = lowMargin.id;

    const outOfStock = await prisma.product.create({
      data: { categoryId: categoryB, sku: `REC-OOS-${suffix}`, name: "Out Of Stock Addon", price: "150.00", costPrice: "50.00", unit: "unit", taxPct: "0" },
    });
    outOfStockProductId = outOfStock.id;

    const priceList = await prisma.priceList.create({ data: { name: `REC-PriceList-${suffix}`, tierId, currency: "USD" } });
    priceListId = priceList.id;
    await prisma.priceListItem.createMany({
      data: [anchor, highMargin, upsell, lowMargin, outOfStock].map((p) => ({
        priceListId,
        productId: p.id,
        unitPrice: p.price,
      })),
    });

    const customer = await prisma.customer.create({ data: { name: `REC-Customer-${suffix}`, tierId } });
    customerId = customer.id;

    const warehouse = await prisma.warehouse.create({ data: { name: `REC-Warehouse-${suffix}` } });
    warehouseId = warehouse.id;
    await prisma.warehouseStock.createMany({
      data: [
        { warehouseId, productId: highMarginProductId, availableQty: 40, reservedQty: 0 },
        { warehouseId, productId: upsellProductId, availableQty: 40, reservedQty: 0 },
        { warehouseId, productId: lowMarginProductId, availableQty: 40, reservedQty: 0 },
        { warehouseId, productId: outOfStockProductId, availableQty: 0, reservedQty: 0 },
      ],
    });

    // Active promotion (this app's closest existing "active promotion" concept) on categoryB.
    // max_discount_pct is stored as a 0-1 fraction, like every other *_pct column in this schema.
    await prisma.discountRule.create({
      data: { scope: "CATEGORY", categoryId: categoryB, maxDiscountPct: "0.20", isActive: true },
    });

    // Co-purchase + tier-affinity history: a same-tier customer's quotation containing both the
    // anchor and the high-margin product, and a different-tier customer's quotation containing
    // only the high-margin product (so tier affinity is a strict fraction, not 100%/0%).
    const sameTierCustomer = await prisma.customer.create({ data: { name: `REC-SameTierCust-${suffix}`, tierId } });
    extraCustomerIds.push(sameTierCustomer.id);
    const otherTierCustomer = await prisma.customer.create({ data: { name: `REC-OtherTierCust-${suffix}`, tierId: otherTierId } });
    extraCustomerIds.push(otherTierCustomer.id);

    const historyQuote1 = await prisma.quotation.create({
      data: {
        code: `REC-HIST1-${suffix}`,
        customerId: sameTierCustomer.id,
        salesRepId,
        priceListId,
        lines: {
          create: [
            { productId: anchorProductId, quantity: 1, unitPrice: "100.00" },
            { productId: highMarginProductId, quantity: 1, unitPrice: "200.00" },
          ],
        },
      },
    });
    extraQuotationIds.push(historyQuote1.id);

    const historyQuote2 = await prisma.quotation.create({
      data: {
        code: `REC-HIST2-${suffix}`,
        customerId: otherTierCustomer.id,
        salesRepId,
        priceListId,
        lines: { create: [{ productId: highMarginProductId, quantity: 1, unitPrice: "200.00" }] },
      },
    });
    extraQuotationIds.push(historyQuote2.id);
  });

  afterAll(async () => {
    const allQuotationIds = [...quotationIds, ...extraQuotationIds];
    await prisma.recommendation.deleteMany({ where: { quotationId: { in: allQuotationIds } } });
    await prisma.quotationLine.deleteMany({ where: { quotationId: { in: allQuotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: allQuotationIds } } });
    await prisma.discountRule.deleteMany({ where: { categoryId: categoryB } });
    await prisma.warehouseStock.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.priceListItem.deleteMany({ where: { priceListId } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.product.deleteMany({
      where: { id: { in: [anchorProductId, highMarginProductId, upsellProductId, lowMarginProductId, outOfStockProductId] } },
    });
    await prisma.customer.deleteMany({ where: { id: { in: [customerId, ...extraCustomerIds] } } });
    await prisma.productCategory.deleteMany({ where: { id: { in: [categoryA, categoryB] } } });
    await prisma.customerTier.deleteMany({ where: { id: { in: [tierId, otherTierId] } } });
    await prisma.user.delete({ where: { id: salesRepId } });
  });

  async function createDraftQuotation() {
    const quotation = await prisma.quotation.create({
      data: {
        code: `REC-Q-${randomUUID()}`,
        customerId,
        salesRepId,
        priceListId,
        lines: { create: [{ productId: anchorProductId, quantity: 1, unitPrice: "100.00" }] },
      },
    });
    quotationIds.push(quotation.id);
    return quotation;
  }

  it("getScoringContext joins anchor lines, co-occurrence, promotions, stock, and tier affinity from real data", async () => {
    const quotation = await createDraftQuotation();
    const ctx = await repository.getScoringContext(quotation.id);

    expect(ctx).not.toBeNull();
    expect(ctx!.anchorLines).toEqual([
      expect.objectContaining({ productId: anchorProductId, categoryId: categoryA, unitPrice: 100 }),
    ]);

    const candidateIds = ctx!.candidates.map((c) => c.productId);
    expect(candidateIds).toContain(highMarginProductId);
    expect(candidateIds).not.toContain(anchorProductId);

    // Co-occurrence: one historical quotation (historyQuote1) shares the anchor product AND
    // contains the high-margin product.
    expect(ctx!.coOccurrenceCounts[highMarginProductId]).toBeGreaterThanOrEqual(1);
    expect(ctx!.coOccurrenceCounts[upsellProductId] ?? 0).toBe(0);

    // Promotion: the active categoryB DiscountRule matches highMargin/lowMargin/outOfStock, not categoryA's upsell product.
    expect(ctx!.matchedPromotions[highMarginProductId]).toMatchObject({ maxDiscountPct: 20 });
    expect(ctx!.matchedPromotions[upsellProductId]).toBeUndefined();

    // Stock.
    expect(ctx!.stockByProduct[highMarginProductId]).toBe(40);
    expect(ctx!.stockByProduct[outOfStockProductId]).toBe(0);

    // Tier affinity: highMargin was bought once by a same-tier customer and once by a different-tier one -> 1/2.
    expect(ctx!.tierAffinity[highMarginProductId]).toEqual({ sameTierCount: 1, totalCount: 2 });
  });

  it("generate persists a ranked, classified top-K excluding below-margin/out-of-stock candidates, then addToQuote/dismiss follow the sticky lifecycle", async () => {
    const quotation = await createDraftQuotation();

    const generated = await service.generate(rep, quotation.id);
    const productIds = generated.map((r) => r.product.id);

    expect(productIds).toContain(highMarginProductId);
    expect(productIds).toContain(upsellProductId);
    expect(productIds).not.toContain(lowMarginProductId); // below configured minimum margin
    expect(productIds).not.toContain(outOfStockProductId); // zero stock

    const upsellRec = generated.find((r) => r.product.id === upsellProductId)!;
    expect(upsellRec.type).toBe("UPSELL");
    const highMarginRec = generated.find((r) => r.product.id === highMarginProductId)!;
    expect(highMarginRec.type).toBe("CROSS_SELL");
    expect(highMarginRec.promotion).toMatchObject({ discountPct: "20.00" });
    expect(highMarginRec.reasonCodes).toContain("FREQUENTLY_CO_PURCHASED");

    // Ranks are a dense 1..N ordering with no gaps or repeats.
    const ranks = generated.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: ranks.length }, (_, i) => i + 1));

    // Add one recommendation to the quote via the real, authoritative QuotationService.addLine path.
    const { quotationId, recommendation: added } = await service.addToQuote(rep, highMarginRec.id, {
      expectedVersion: 1,
    });
    expect(quotationId).toBe(quotation.id);
    expect(added.id).toBe(highMarginRec.id);

    const persistedLine = await prisma.quotationLine.findFirst({
      where: { quotationId: quotation.id, productId: highMarginProductId },
    });
    expect(persistedLine).not.toBeNull();
    const addedRow = await prisma.recommendation.findUniqueOrThrow({ where: { id: highMarginRec.id } });
    expect(addedRow.status).toBe("ADDED");
    expect(addedRow.addedQuotationLineId).toBe(persistedLine!.id);

    // Adding again must be rejected — the recommendation is no longer PENDING.
    await expect(
      service.addToQuote(rep, highMarginRec.id, { expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "ALREADY_ACTIONED" });

    // Dismiss the upsell recommendation instead of adding it.
    const dismissed = await service.dismiss(rep, upsellRec.id);
    expect(dismissed.id).toBe(upsellRec.id);
    const dismissedRow = await prisma.recommendation.findUniqueOrThrow({ where: { id: upsellRec.id } });
    expect(dismissedRow.status).toBe("DISMISSED");
    expect(dismissedRow.dismissedByUserId).toBe(salesRepId);

    // Re-generating must not resurrect either sticky decision, and must not re-offer the product
    // that is now already on the quote.
    const regenerated = await service.generate(rep, quotation.id);
    const regeneratedIds = regenerated.map((r) => r.product.id);
    expect(regeneratedIds).not.toContain(highMarginProductId);
    expect(regeneratedIds).not.toContain(upsellProductId);

    const pending = await service.list(rep, quotation.id);
    expect(pending.every((r) => r.product.id !== highMarginProductId && r.product.id !== upsellProductId)).toBe(true);
  });

  it("forbids a different sales rep from generating, adding to, or dismissing recommendations on this quotation", async () => {
    const quotation = await createDraftQuotation();
    const generated = await service.generate(rep, quotation.id);
    const other: Actor = { id: randomUUID(), role: "SALES_REP" };

    await expect(service.generate(other, quotation.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.list(other, quotation.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.addToQuote(other, generated[0].id, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.dismiss(other, generated[0].id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
