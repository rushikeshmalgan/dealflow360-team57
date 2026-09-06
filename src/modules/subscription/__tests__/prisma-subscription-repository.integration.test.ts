import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";

import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import { calculateCancellationRefund } from "../domain/cancellation";
import { calculateProration } from "../domain/proration";
import { PrismaSubscriptionRepository } from "../infrastructure/prisma-subscription-repository";

let actor: Actor;

describe("PrismaSubscriptionRepository (Epic 10 Integration Tests)", () => {
  const repository = new PrismaSubscriptionRepository();

  let customerId: string;
  let repUserId: string;
  let priceListId: string;
  let categoryId: string;
  let hardwareProductId: string;
  let subscriptionProductId: string;
  let planId: string;
  let createdQuotationId: string;
  let directSubscriptionId: string;

  beforeAll(async () => {
    // 1. User
    const user = await prisma.user.upsert({
      where: { email: "billing-rep@example.com" },
      update: {},
      create: {
        passwordHash: "test-fixture",
        email: "billing-rep@example.com",
        role: "ADMIN",
      },
    });
    repUserId = user.id;
    actor = { id: repUserId, role: "ADMIN" };

    // 2. Customer Tier & Customer
    const tier = await prisma.customerTier.upsert({
      where: { name: "Billing Test Tier" },
      update: {},
      create: { name: "Billing Test Tier" },
    });

    const customer = await prisma.customer.create({
      data: {
        name: "Acme Billing Corp",
        tierId: tier.id,
      },
    });
    customerId = customer.id;

    // 3. Price List
    const priceList = await prisma.priceList.create({
      data: {
        name: "Billing Test Price List",
        tierId: tier.id,
        currency: "USD",
      },
    });
    priceListId = priceList.id;

    // 4. Category & Products
    const category = await prisma.productCategory.create({
      data: { name: "Billing Category Test" },
    });
    categoryId = category.id;

    const hardwareProduct = await prisma.product.create({
      data: {
        categoryId,
        sku: "TEST-HW-001",
        name: "Test Hardware Server",
        price: 1000,
        unit: "box",
        taxPct: 0.1,
        isSubscription: false,
      },
    });
    hardwareProductId = hardwareProduct.id;

    const subProduct = await prisma.product.create({
      data: {
        categoryId,
        sku: "TEST-SLA-001",
        name: "Test Cloud Support SLA",
        price: 200,
        unit: "seat",
        taxPct: 0.1,
        isSubscription: true,
        recurringCycle: "MONTHLY",
      },
    });
    subscriptionProductId = subProduct.id;

    // 5. Subscription Plan
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: "Test SLA Monthly Plan",
        cadence: "MONTHLY",
        productId: subscriptionProductId,
        prorationRule: {
          strategy: "DAY_BASED",
          allowMidCycle: true,
        },
        cancellationRule: {
          policy: "END_OF_CYCLE",
          allowImmediate: true,
          refundEligible: true,
        },
        partialRefundRule: {
          strategy: "PRO_RATA_REFUND",
          creditNoteOnCancel: true,
          minimumDaysForRefund: 1,
        },
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    // Cleanup records created
    await prisma.creditNote.deleteMany({
      where: { invoice: { customerId } },
    });
    await prisma.invoiceLine.deleteMany({
      where: { invoice: { customerId } },
    });
    await prisma.payment.deleteMany({
      where: { invoice: { customerId } },
    });
    await prisma.invoice.deleteMany({
      where: { customerId },
    });
    await prisma.billingSchedule.deleteMany({
      where: { subscription: { customerId } },
    });
    await prisma.subscription.deleteMany({
      where: { customerId },
    });
    if (createdQuotationId) {
      await prisma.quotationLine.deleteMany({ where: { quotationId: createdQuotationId } });
      await prisma.quotation.deleteMany({ where: { id: createdQuotationId } });
    }
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.product.deleteMany({
      where: { id: { in: [hardwareProductId, subscriptionProductId] } },
    });
    await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    await prisma.priceList.deleteMany({ where: { id: priceListId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
  });

  it("T10.1: creates a subscription directly with initial billing schedule and invoice", async () => {
    const sub = await repository.create(
      {
        customerId,
        planId,
        cycle: "MONTHLY",
        amount: 200,
      },
      actor,
    );

    directSubscriptionId = sub.id;
    expect(sub.id).toBeDefined();
    expect(sub.customerId).toBe(customerId);
    expect(sub.planId).toBe(planId);
    expect(sub.cycle).toBe("MONTHLY");
    expect(sub.status).toBe("ACTIVE");
    expect(sub.version).toBe(1);

    const schedules = await repository.getBillingSchedules(sub.id);
    expect(schedules.length).toBe(1);
    expect(Number(schedules[0].amount)).toBe(200);
    expect(schedules[0].status).toBe("SCHEDULED");

    // Verify invoice was created for initial cycle
    const invoice = await prisma.invoice.findFirst({
      where: { subscriptionId: sub.id },
      include: { lines: true },
    });
    expect(invoice).toBeDefined();
    expect(Number(invoice?.totalAmount)).toBe(200);
  });

  it("T10.1: classifies quotation lines into one-time invoice and recurring subscription + schedule", async () => {
    // Create quotation with 1 ONE_TIME line ($1,000) and 1 RECURRING line ($200)
    const quote = await prisma.quotation.create({
      data: {
        code: `Q-TEST-${Date.now()}`,
        customerId,
        salesRepId: repUserId,
        priceListId,
        status: "CONFIRMED",
        lines: {
          create: [
            {
              productId: hardwareProductId,
              quantity: 2,
              unitPrice: 1000,
              lineDiscountPct: 0,
              billingType: "ONE_TIME",
            },
            {
              productId: subscriptionProductId,
              quantity: 1,
              unitPrice: 200,
              lineDiscountPct: 0,
              billingType: "RECURRING",
            },
          ],
        },
      },
    });
    createdQuotationId = quote.id;

    // Execute T10.1 billing plan creation
    const result = await repository.createFromQuotation(createdQuotationId, actor);

    // One-time lines -> Invoice
    expect(result.invoice).toBeDefined();
    expect(Number(result.invoice?.totalAmount)).toBe(2000); // 2 * $1,000
    expect(result.invoice?.lineCount).toBe(1);

    // Recurring lines -> Subscriptions
    expect(result.subscriptions.length).toBe(1);
    const sub = result.subscriptions[0];
    expect(sub.quotationId).toBe(createdQuotationId);
    expect(sub.cycle).toBe("MONTHLY");

    const schedules = await repository.getBillingSchedules(sub.id);
    expect(schedules.length).toBe(1);
    expect(Number(schedules[0].amount)).toBe(200);

    // Originating order billing detail (Screen 10)
    const detail = await repository.getBillingDetail(sub.id);
    expect(detail).toBeDefined();
    expect(detail?.originatingOrder.oneTimeLines.length).toBe(1);
    expect(detail?.originatingOrder.oneTimeLines[0].description).toBe("Test Hardware Server");
    expect(detail?.recurringLines.length).toBeGreaterThanOrEqual(1);

    // Idempotency: second call returns same result without duplicating
    const secondCall = await repository.createFromQuotation(createdQuotationId, actor);
    expect(secondCall.invoice?.id).toBe(result.invoice?.id);
    expect(secondCall.subscriptions.length).toBe(result.subscriptions.length);
  });

  it("T10.2: executes day-based proration modification and increments version", async () => {
    const sub = await repository.get(directSubscriptionId);
    expect(sub).toBeDefined();

    const currentStartDate = new Date(sub!.startDate);
    const currentEndDate = new Date(sub!.nextBillDate);
    const effectiveDate = new Date(currentStartDate.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days in

    const proration = calculateProration({
      currentStartDate,
      currentEndDate,
      currentAmount: 200,
      effectiveDate,
      newAmount: 400, // upgrade to $400
    });

    const modified = await repository.modify(
      directSubscriptionId,
      {
        amount: 400,
        effectiveDate: effectiveDate.toISOString(),
        expectedVersion: sub!.version,
      },
      proration,
      actor,
    );

    expect(modified.subscription.version).toBe(sub!.version + 1);
    expect(modified.proration.strategy).toBe("DAY_BASED");
    expect(modified.proration.isUpgrade).toBe(true);

    const schedules = await repository.getBillingSchedules(directSubscriptionId);
    expect(schedules.length).toBe(2);
    expect(schedules[1].status).toBe("PRORATED_UPGRADE");
  });

  it("T10.2: rejects stale version on modification with 409 VERSION_CONFLICT", async () => {
    const sub = await repository.get(directSubscriptionId);
    const staleVersion = sub!.version - 1;

    const proration = calculateProration({
      currentStartDate: new Date(sub!.startDate),
      currentEndDate: new Date(sub!.nextBillDate),
      currentAmount: 400,
      effectiveDate: new Date(),
      newAmount: 500,
    });

    await expect(
      repository.modify(
        directSubscriptionId,
        {
          amount: 500,
          expectedVersion: staleVersion,
        },
        proration,
        actor,
      ),
    ).rejects.toThrow(ServiceError);
  });

  it("T10.3: cancels subscription, updates status to CANCELLED and generates CreditNote", async () => {
    const sub = await repository.get(directSubscriptionId);
    expect(sub).toBeDefined();

    const currentStartDate = new Date(sub!.startDate);
    const currentEndDate = new Date(sub!.nextBillDate);
    const cancelDate = new Date(currentStartDate.getTime() + 10 * 24 * 60 * 60 * 1000);

    const cancellation = calculateCancellationRefund({
      currentStartDate,
      currentEndDate,
      currentAmount: 200,
      cancelDate,
      immediate: true,
    });

    const result = await repository.cancel(
      directSubscriptionId,
      {
        reason: "Customer dissatisfaction with SLA response time",
        immediate: true,
        cancelDate: cancelDate.toISOString(),
        expectedVersion: sub!.version,
      },
      cancellation,
      actor,
    );

    expect(result.subscription.status).toBe("CANCELLED");
    expect(result.subscription.version).toBe(sub!.version + 1);
    expect(result.cancellation.refundEligible).toBe(true);
    expect(result.creditNote).toBeDefined();
    expect(Number(result.creditNote?.amount)).toBeGreaterThan(0);

    // Verify CreditNote exists in DB
    const creditNoteInDb = await prisma.creditNote.findUnique({
      where: { id: result.creditNote!.id },
    });
    expect(creditNoteInDb).toBeDefined();
    expect(creditNoteInDb?.reason).toContain("Customer dissatisfaction");
  });
});
