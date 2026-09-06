import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { registerRequestActorResolver } from "@/lib/request-actor";
import type { Actor } from "@/modules/shared/domain/actor";
import { GET as getSchedules } from "../../billing-schedules/[subscriptionId]/route";
import { GET as getBillingDetail } from "../[id]/billing/route";
import { POST as cancelSubscription } from "../[id]/cancel/route";
import { POST as modifySubscriptionPost } from "../[id]/modify/route";
import { GET as getSubscription, PATCH as patchSubscription } from "../[id]/route";
import { GET as listSubscriptions, POST as createSubscription } from "../route";

describe("Subscription REST API routes (Epic 10)", () => {
  let customerId: string;
  let repUserId: string;
  let planId: string;
  let categoryId: string;
  let subProductId: string;
  let createdSubId: string;

  beforeAll(async () => {
    registerRequestActorResolver(async (req) => {
      const role = (req.headers.get("x-test-role") as Actor["role"]) || "ADMIN";
      const id = req.headers.get("x-test-user-id") || repUserId;
      return { id, role };
    });

    // 1. User
    const user = await prisma.user.upsert({
      where: { email: "api-sub-user@example.com" },
      update: {},
      create: {
        passwordHash: "test-fixture",
        email: "api-sub-user@example.com",
        role: "ADMIN",
      },
    });
    repUserId = user.id;

    // 2. Customer Tier & Customer
    const tier = await prisma.customerTier.upsert({
      where: { name: "API Test Tier" },
      update: {},
      create: { name: "API Test Tier" },
    });

    const customer = await prisma.customer.create({
      data: {
        name: "Acme API Corp",
        tierId: tier.id,
      },
    });
    customerId = customer.id;

    // 3. Category & Product
    const category = await prisma.productCategory.create({
      data: { name: "API Test Category" },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        categoryId,
        sku: "API-SLA-001",
        name: "API Test SLA Product",
        price: 300,
        unit: "seat",
        taxPct: 0.1,
        isSubscription: true,
        recurringCycle: "MONTHLY",
      },
    });
    subProductId = product.id;

    // 4. Plan
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: "API Test Plan",
        cadence: "MONTHLY",
        productId: subProductId,
        prorationRule: { strategy: "DAY_BASED", allowMidCycle: true },
        cancellationRule: { policy: "END_OF_CYCLE", allowImmediate: true, refundEligible: true },
        partialRefundRule: { strategy: "PRO_RATA_REFUND", creditNoteOnCancel: true, minimumDaysForRefund: 1 },
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    await prisma.creditNote.deleteMany({ where: { invoice: { customerId } } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { customerId } } });
    await prisma.invoice.deleteMany({ where: { customerId } });
    await prisma.billingSchedule.deleteMany({ where: { subscription: { customerId } } });
    await prisma.subscription.deleteMany({ where: { customerId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.product.deleteMany({ where: { id: subProductId } });
    await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
  });

  function makeRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("x-test-role", "ADMIN");
    headers.set("x-test-user-id", repUserId);
    const { signal, ...rest } = init ?? {};
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      ...rest,
      headers,
      ...(signal ? { signal } : {}),
    });
  }

  it("POST /api/subscriptions creates a new subscription", async () => {
    const req = makeRequest("http://localhost:3000/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customerId,
        planId,
        cycle: "MONTHLY",
        amount: 300,
      }),
    });

    const res = await createSubscription(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeDefined();
    expect(body.data.status).toBe("ACTIVE");
    createdSubId = body.data.id;
  });

  it("GET /api/subscriptions lists subscriptions", async () => {
    const req = makeRequest(`http://localhost:3000/api/subscriptions?customerId=${customerId}`);
    const res = await listSubscriptions(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/subscriptions/[id] returns subscription detail", async () => {
    const req = makeRequest(`http://localhost:3000/api/subscriptions/${createdSubId}`);
    const res = await getSubscription(req, { params: Promise.resolve({ id: createdSubId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdSubId);
    expect(body.data.plan.name).toBe("API Test Plan");
  });

  it("GET /api/billing-schedules/[subscriptionId] returns billing schedules (T10.1)", async () => {
    const req = makeRequest(`http://localhost:3000/api/billing-schedules/${createdSubId}`);
    const res = await getSchedules(req, { params: Promise.resolve({ subscriptionId: createdSubId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(Number(body.data[0].amount)).toBe(300);
  });

  it("GET /api/subscriptions/[id]/billing returns Screen 10 billing detail", async () => {
    const req = makeRequest(`http://localhost:3000/api/subscriptions/${createdSubId}/billing`);
    const res = await getBillingDetail(req, { params: Promise.resolve({ id: createdSubId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.customerName).toBe("Acme API Corp");
    expect(body.data.planName).toBe("API Test Plan");
    expect(Array.isArray(body.data.billingSchedules)).toBe(true);
  });

  it("PATCH /api/subscriptions/[id] calculates proration (T10.2)", async () => {
    const req = makeRequest(`http://localhost:3000/api/subscriptions/${createdSubId}`, {
      method: "PATCH",
      body: JSON.stringify({
        amount: 600,
        expectedVersion: 1,
      }),
    });

    const res = await patchSubscription(req, { params: Promise.resolve({ id: createdSubId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.proration.strategy).toBe("DAY_BASED");
    expect(body.data.subscription.version).toBe(2);
  });

  it("POST /api/subscriptions/[id]/modify works as modify alias", async () => {
    const req = makeRequest(`http://localhost:3000/api/subscriptions/${createdSubId}/modify`, {
      method: "POST",
      body: JSON.stringify({
        amount: 700,
        expectedVersion: 2,
      }),
    });

    const res = await modifySubscriptionPost(req, { params: Promise.resolve({ id: createdSubId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subscription.version).toBe(3);
  });

  it("POST /api/subscriptions/[id]/cancel cancels subscription and triggers CreditNote (T10.3)", async () => {
    const req = makeRequest(`http://localhost:3000/api/subscriptions/${createdSubId}/cancel`, {
      method: "POST",
      body: JSON.stringify({
        reason: "Contract ended early",
        immediate: true,
        expectedVersion: 3,
      }),
    });

    const res = await cancelSubscription(req, { params: Promise.resolve({ id: createdSubId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subscription.status).toBe("CANCELLED");
    expect(body.data.creditNote).toBeDefined();
    expect(Number(body.data.creditNote.amount)).toBeGreaterThan(0);
  });
});
