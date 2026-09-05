import { describe, expect, it, beforeAll, afterAll } from "vitest";
import "dotenv/config";

import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { PrismaPlanRepository } from "../infrastructure/prisma-plan-repository";
import {
  DEFAULT_CANCELLATION_RULE,
  DEFAULT_PARTIAL_REFUND_RULE,
  DEFAULT_PRORATION_RULE,
} from "../domain/cadence";

describe("PrismaPlanRepository live database integration", () => {
  const repository = new PrismaPlanRepository();
  let testCategoryId: string;
  let testProductId: string;
  const createdPlanIds: string[] = [];

  beforeAll(async () => {
    // Create temporary category & product for testing
    const category = await prisma.productCategory.upsert({
      where: { name: "Test Subscription Category" },
      update: {},
      create: {
        name: "Test Subscription Category",
        description: "Category for plan testing",
      },
    });
    testCategoryId = category.id;

    const product = await prisma.product.upsert({
      where: { sku: "TEST-SUB-PROD-001" },
      update: {},
      create: {
        categoryId: testCategoryId,
        sku: "TEST-SUB-PROD-001",
        name: "Live Test Subscription Product",
        price: 99.99,
        unit: "license",
        taxPct: 0.18,
        isSubscription: true,
        recurringCycle: "MONTHLY",
      },
    });
    testProductId = product.id;
  });

  afterAll(async () => {
    // Clean up created test plans
    if (createdPlanIds.length > 0) {
      await prisma.subscriptionPlan.deleteMany({
        where: { id: { in: createdPlanIds } },
      });
    }

    // Clean up product & category
    if (testProductId) {
      await prisma.product.deleteMany({ where: { id: testProductId } });
    }
    if (testCategoryId) {
      await prisma.productCategory.deleteMany({ where: { id: testCategoryId } });
    }
    await prisma.$disconnect();
  });

  it("creates a valid monthly plan with attached product and default rules", async () => {
    const plan = await repository.create({
      name: `Live Test Monthly Plan ${Date.now()}`,
      cadence: "MONTHLY",
      productId: testProductId,
      prorationRule: DEFAULT_PRORATION_RULE,
      cancellationRule: DEFAULT_CANCELLATION_RULE,
      partialRefundRule: DEFAULT_PARTIAL_REFUND_RULE,
      isActive: true,
    });

    createdPlanIds.push(plan.id);

    expect(plan.id).toBeDefined();
    expect(plan.cadence).toBe("MONTHLY");
    expect(plan.productId).toBe(testProductId);
    expect(plan.product).toBeDefined();
    expect(plan.product?.sku).toBe("TEST-SUB-PROD-001");
    expect(plan.prorationRule).toEqual(DEFAULT_PRORATION_RULE);
  });

  it("creates quarterly and yearly plans with custom configuration", async () => {
    const quarterly = await repository.create({
      name: `Live Test Quarterly Plan ${Date.now()}`,
      cadence: "QUARTERLY",
      productId: null,
      prorationRule: { strategy: "QUARTER_PRORATED", dayCount: 90 },
      cancellationRule: { policy: "END_OF_QUARTER" },
      partialRefundRule: { allowRefund: false },
      isActive: true,
    });
    createdPlanIds.push(quarterly.id);
    expect(quarterly.cadence).toBe("QUARTERLY");
    expect(quarterly.productId).toBeNull();
    expect(quarterly.prorationRule).toEqual({ strategy: "QUARTER_PRORATED", dayCount: 90 });

    const yearly = await repository.create({
      name: `Live Test Yearly Plan ${Date.now()}`,
      cadence: "YEARLY",
      productId: null,
      prorationRule: { strategy: "ANNUAL_SCHEDULE", precision: "DAY" },
      cancellationRule: { policy: "ANNUAL_PRORATED_REFUND" },
      partialRefundRule: { allowRefund: true, maxRefundPct: 80 },
      isActive: true,
    });
    createdPlanIds.push(yearly.id);
    expect(yearly.cadence).toBe("YEARLY");
    expect(yearly.partialRefundRule).toEqual({ allowRefund: true, maxRefundPct: 80 });
  });

  it("rejects plan with non-existent attached product", async () => {
    const ghostProductId = "00000000-0000-0000-0000-000000000000";

    await expect(
      repository.create({
        name: `Ghost Product Plan ${Date.now()}`,
        cadence: "MONTHLY",
        productId: ghostProductId,
        prorationRule: DEFAULT_PRORATION_RULE,
        cancellationRule: DEFAULT_CANCELLATION_RULE,
        partialRefundRule: DEFAULT_PARTIAL_REFUND_RULE,
        isActive: true,
      }),
    ).rejects.toThrowError(ServiceError);
  });

  it("rejects duplicate plan name with CONFIGURATION_CONFLICT", async () => {
    const planName = `Duplicate Test Plan ${Date.now()}`;
    const plan = await repository.create({
      name: planName,
      cadence: "MONTHLY",
      productId: null,
      prorationRule: DEFAULT_PRORATION_RULE,
      cancellationRule: DEFAULT_CANCELLATION_RULE,
      partialRefundRule: DEFAULT_PARTIAL_REFUND_RULE,
      isActive: true,
    });
    createdPlanIds.push(plan.id);

    await expect(
      repository.create({
        name: planName,
        cadence: "YEARLY",
        productId: null,
        prorationRule: DEFAULT_PRORATION_RULE,
        cancellationRule: DEFAULT_CANCELLATION_RULE,
        partialRefundRule: DEFAULT_PARTIAL_REFUND_RULE,
        isActive: true,
      }),
    ).rejects.toThrow("A subscription plan with this name already exists");
  });

  it("updates plan fields and detaches/attaches product", async () => {
    const plan = await repository.create({
      name: `Update Test Plan ${Date.now()}`,
      cadence: "MONTHLY",
      productId: null,
      prorationRule: DEFAULT_PRORATION_RULE,
      cancellationRule: DEFAULT_CANCELLATION_RULE,
      partialRefundRule: DEFAULT_PARTIAL_REFUND_RULE,
      isActive: true,
    });
    createdPlanIds.push(plan.id);

    const updated = await repository.update(plan.id, {
      cadence: "YEARLY",
      productId: testProductId,
      isActive: false,
    });

    expect(updated).not.toBeNull();
    expect(updated?.cadence).toBe("YEARLY");
    expect(updated?.productId).toBe(testProductId);
    expect(updated?.isActive).toBe(false);
  });

  it("lists plans with cadence and active filters", async () => {
    const plans = await repository.list({ cadence: "MONTHLY" });
    expect(Array.isArray(plans)).toBe(true);
    for (const p of plans) {
      expect(p.cadence).toBe("MONTHLY");
    }
  });

  it("deletes a plan successfully", async () => {
    const plan = await repository.create({
      name: `Delete Test Plan ${Date.now()}`,
      cadence: "MONTHLY",
      productId: null,
      prorationRule: DEFAULT_PRORATION_RULE,
      cancellationRule: DEFAULT_CANCELLATION_RULE,
      partialRefundRule: DEFAULT_PARTIAL_REFUND_RULE,
      isActive: true,
    });

    const deleted = await repository.delete(plan.id);
    expect(deleted).toBe(true);

    const check = await repository.get(plan.id);
    expect(check).toBeNull();
  });
});
