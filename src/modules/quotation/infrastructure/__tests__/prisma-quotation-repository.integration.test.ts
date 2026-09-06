import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import { PrismaQuotationRepository } from "../prisma-quotation-repository";

/**
 * Hits the real dev Postgres (docker-compose), matching the discount-risk integration test's
 * approach — this exercises PricingService.resolvePrice, the audit write, and the
 * withOptimisticVersion 409 path for real, none of which a mocked repository can prove.
 */
describe.skipIf(!process.env.DATABASE_URL)("PrismaQuotationRepository (integration)", () => {
  const repository = new PrismaQuotationRepository();
  let actor: Actor;
  let tierId: string;
  let customerId: string;
  let categoryId: string;
  let productId: string;
  let priceListId: string;
  const quotationIds: string[] = [];

  beforeAll(async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { passwordHash: "test-fixture", email: `rep+${suffix}@test.local`, role: "SALES_REP" },
    });
    actor = { id: user.id, role: "SALES_REP" };

    const tier = await prisma.customerTier.create({ data: { name: `T6-Test-Tier-${suffix}` } });
    tierId = tier.id;

    const customer = await prisma.customer.create({
      data: { name: `T6-Test-Customer-${suffix}`, tierId },
    });
    customerId = customer.id;

    const category = await prisma.productCategory.create({
      data: { name: `T6-Test-Category-${suffix}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        categoryId,
        sku: `T6-SKU-${suffix}`,
        name: "Test Laptop",
        price: "1000.00",
        costPrice: "700.00",
        unit: "unit",
        taxPct: "0",
      },
    });
    productId = product.id;

    const priceList = await prisma.priceList.create({
      data: {
        name: `T6-Test-PriceList-${suffix}`,
        tierId,
        currency: "USD",
        items: { create: [{ productId, unitPrice: "1000.00" }] },
      },
    });
    priceListId = priceList.id;
  });

  afterAll(async () => {
    await prisma.quotationLine.deleteMany({ where: { quotationId: { in: quotationIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: quotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: quotationIds } } });
    await prisma.priceListItem.deleteMany({ where: { priceListId } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.customerTier.delete({ where: { id: tierId } });
    await prisma.user.delete({ where: { id: actor.id } });
  });

  it("creates a Draft quotation with a generated code and writes an audit log row", async () => {
    const created = await repository.create({ customerId, priceListId }, actor);
    quotationIds.push(created.id);

    expect(created.status).toBe("DRAFT");
    expect(created.version).toBe(1);
    expect(created.code).toMatch(/^QT-\d{6}$/);
    expect(created.salesRep.id).toBe(actor.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: "CREATE" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects creating a quotation when the price list tier does not match the customer's tier", async () => {
    const otherTier = await prisma.customerTier.create({
      data: { name: `T6-Mismatch-Tier-${randomUUID()}` },
    });
    const mismatchedCustomer = await prisma.customer.create({
      data: { name: `T6-Mismatch-Customer-${randomUUID()}`, tierId: otherTier.id },
    });
    try {
      await expect(
        repository.create({ customerId: mismatchedCustomer.id, priceListId }, actor),
      ).rejects.toBeInstanceOf(ServiceError);
    } finally {
      await prisma.customer.delete({ where: { id: mismatchedCustomer.id } });
      await prisma.customerTier.delete({ where: { id: otherTier.id } });
    }
  });

  it("resolves the price via PricingService when adding a line, and increments the version", async () => {
    const created = await repository.create({ customerId, priceListId }, actor);
    quotationIds.push(created.id);

    const withLine = await repository.addLine(
      created.id,
      { expectedVersion: created.version, productId, quantity: 2, billingType: "ONE_TIME" },
      actor,
    );

    expect(withLine.version).toBe(created.version + 1);
    expect(withLine.lines).toHaveLength(1);
    expect(withLine.lines[0].unitPrice).toBe("1000.00");
    expect(withLine.summary.netBeforeTax).toBe("2000.00");
    expect(withLine.summary.marginAmount).toBe("600.00"); // (1000-700)*2
  });

  it("returns VERSION_CONFLICT with the current version on a stale addLine call", async () => {
    const created = await repository.create({ customerId, priceListId }, actor);
    quotationIds.push(created.id);

    const staleVersion = created.version;
    await repository.addLine(
      created.id,
      { expectedVersion: staleVersion, productId, quantity: 1, billingType: "ONE_TIME" },
      actor,
    );

    await expect(
      repository.addLine(
        created.id,
        { expectedVersion: staleVersion, productId, quantity: 1, billingType: "ONE_TIME" },
        actor,
      ),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      details: { currentVersion: staleVersion + 1 },
    });
  });

  it("combines line and order discounts sequentially in the returned summary", async () => {
    const created = await repository.create({ customerId, priceListId }, actor);
    quotationIds.push(created.id);
    const withLine = await repository.addLine(
      created.id,
      { expectedVersion: created.version, productId, quantity: 1, billingType: "ONE_TIME" },
      actor,
    );

    const updated = await repository.updateDiscounts(
      created.id,
      {
        expectedVersion: withLine.version,
        orderDiscountPct: 10,
        lineDiscounts: [{ lineId: withLine.lines[0].id, lineDiscountPct: 12 }],
      },
      actor,
    );

    // 1 - (1-0.12)*(1-0.10) = 0.208 -> net = 1000 * 0.792 = 792.00
    expect(updated.lines[0].effectiveDiscountPct).toBe("20.8");
    expect(updated.summary.netBeforeTax).toBe("792.00");
  });
});
