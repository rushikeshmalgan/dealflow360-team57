import { describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import type { PlanRepository, SubscriptionRepository } from "../application/ports";
import { SubscriptionService } from "../application/subscription-service";
import type { SubscriptionDto, SubscriptionPlanDto } from "../application/types";

const adminActor: Actor = { id: "user-admin", role: "ADMIN" };
const repActor: Actor = { id: "user-rep", role: "SALES_REP" };
const financeActor: Actor = { id: "user-finance", role: "FINANCE_OPS" };
const managerActor: Actor = { id: "user-manager", role: "MANAGER" };
const customerActor: Actor = { id: "user-cust", role: "CUSTOMER" };

const mockPlan: SubscriptionPlanDto = {
  id: "44444444-4444-4444-a444-444444444444",
  name: "Enterprise SLA",
  cadence: "MONTHLY",
  productId: null,
  product: {
    id: "prod-1",
    sku: "SLA-01",
    name: "Enterprise SLA",
    price: "500.00",
  },
  prorationRule: { strategy: "DAY_BASED", allowMidCycle: true },
  cancellationRule: { policy: "END_OF_CYCLE", allowImmediate: true, refundEligible: true },
  partialRefundRule: { strategy: "PRO_RATA_REFUND", creditNoteOnCancel: true, minimumDaysForRefund: 1 },
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const mockSub: SubscriptionDto = {
  id: "55555555-5555-4555-a555-555555555555",
  customerId: "66666666-6666-4666-a666-666666666666",
  quotationId: null,
  planId: mockPlan.id,
  plan: mockPlan,
  cycle: "MONTHLY",
  status: "ACTIVE",
  startDate: "2026-09-01T00:00:00.000Z",
  nextBillDate: "2026-10-01T00:00:00.000Z",
  version: 1,
  billingSchedules: [
    {
      id: "sched-1",
      subscriptionId: "55555555-5555-5555-5555-555555555555",
      cycleStart: "2026-09-01T00:00:00.000Z",
      cycleEnd: "2026-10-01T00:00:00.000Z",
      amount: "300.00",
      status: "SCHEDULED",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("SubscriptionService (Epic 10 Unit Tests)", () => {
  function makeService(overrides?: {
    repo?: Partial<SubscriptionRepository>;
    planRepo?: Partial<PlanRepository>;
  }) {
    const repository: SubscriptionRepository = {
      list: vi.fn().mockResolvedValue([mockSub]),
      get: vi.fn().mockResolvedValue(mockSub),
      getBillingSchedules: vi.fn().mockResolvedValue(mockSub.billingSchedules ?? []),
      getBillingDetail: vi.fn().mockResolvedValue({
        subscription: mockSub,
        customerName: "Acme Corp",
        planName: mockPlan.name,
        cycle: "MONTHLY",
        nextBillDate: mockSub.nextBillDate,
        originatingOrder: { quotationId: null, oneTimeLines: [] },
        recurringLines: [],
        billingSchedules: mockSub.billingSchedules ?? [],
      }),
      create: vi.fn().mockResolvedValue(mockSub),
      createFromQuotation: vi.fn().mockResolvedValue({
        quotationId: "q-1",
        invoice: null,
        subscriptions: [mockSub],
      }),
      modify: vi.fn().mockResolvedValue({
        subscription: { ...mockSub, version: 2 },
        proration: {
          strategy: "DAY_BASED",
          totalCycleDays: 30,
          daysElapsed: 10,
          daysRemaining: 20,
          currentAmount: 300,
          usedAmount: 100,
          unusedCredit: 200,
          newAmount: 600,
          newProratedCharge: 400,
          netAdjustment: 200,
          isUpgrade: true,
          explanation: "upgrade",
        },
        schedule: { ...mockSub.billingSchedules![0], id: "sched-2" },
      }),
      cancel: vi.fn().mockResolvedValue({
        subscription: { ...mockSub, status: "CANCELLED", version: 2 },
        cancellation: {
          effectiveCancellationDate: "2026-09-11T00:00:00.000Z",
          immediate: true,
          policy: "IMMEDIATE",
          refundEligible: true,
          creditNoteRequired: true,
          refundAmount: 200,
          explanation: "Pro-rata refund",
        },
        creditNote: {
          id: "cn-1",
          invoiceId: "inv-1",
          amount: "200.00",
          reason: "Cancellation",
          createdAt: "2026-09-11T00:00:00.000Z",
        },
      }),
      ...overrides?.repo,
    };

    const planRepository: PlanRepository = {
      list: vi.fn().mockResolvedValue([mockPlan]),
      get: vi.fn().mockResolvedValue(mockPlan),
      getByName: vi.fn().mockResolvedValue(mockPlan),
      create: vi.fn().mockResolvedValue(mockPlan),
      update: vi.fn().mockResolvedValue(mockPlan),
      delete: vi.fn().mockResolvedValue(true),
      ...overrides?.planRepo,
    };

    return { service: new SubscriptionService(repository, planRepository), repository, planRepository };
  }

  describe("Role & access enforcement", () => {
    it("denies unauthenticated actors", async () => {
      const { service } = makeService();
      await expect(service.list(null)).rejects.toThrow(ServiceError);
      await expect(service.get(null, mockSub.id)).rejects.toThrow(ServiceError);
    });

    it("denies CUSTOMER access to internal subscriptions list", async () => {
      const { service } = makeService();
      await expect(service.list(customerActor)).rejects.toThrow(ServiceError);
      await expect(service.get(customerActor, mockSub.id)).rejects.toThrow(ServiceError);
    });

    it("allows internal roles to list and view subscriptions", async () => {
      const { service } = makeService();
      await expect(service.list(repActor)).resolves.toBeDefined();
      await expect(service.list(managerActor)).resolves.toBeDefined();
      await expect(service.list(financeActor)).resolves.toBeDefined();
      await expect(service.list(adminActor)).resolves.toBeDefined();
    });

    it("restricts modify and cancel to ADMIN, FINANCE_OPS, and MANAGER", async () => {
      const { service } = makeService();
      // SALES_REP cannot modify/cancel
      await expect(
        service.modify(repActor, mockSub.id, { expectedVersion: 1, amount: 600 }),
      ).rejects.toThrow(ServiceError);
      await expect(
        service.cancel(repActor, mockSub.id, { expectedVersion: 1 }),
      ).rejects.toThrow(ServiceError);

      // FINANCE_OPS can modify and cancel
      await expect(
        service.modify(financeActor, mockSub.id, { expectedVersion: 1, amount: 600 }),
      ).resolves.toBeDefined();
      await expect(
        service.cancel(financeActor, mockSub.id, { expectedVersion: 1 }),
      ).resolves.toBeDefined();
    });
  });

  describe("Proration & Modification (T10.2)", () => {
    it("orchestrates day-based proration calculation and passes to repository", async () => {
      const { service, repository } = makeService();

      const result = await service.modify(financeActor, mockSub.id, {
        planId: mockPlan.id,
        amount: 600,
        effectiveDate: "2026-09-11T00:00:00.000Z",
        expectedVersion: 1,
      });

      expect(repository.modify).toHaveBeenCalledWith(
        mockSub.id,
        expect.objectContaining({ expectedVersion: 1, amount: 600 }),
        expect.objectContaining({
          strategy: "DAY_BASED",
          totalCycleDays: 30,
          daysElapsed: 10,
          daysRemaining: 20,
        }),
        financeActor,
      );
      expect(result.proration.strategy).toBe("DAY_BASED");
    });

    it("rejects modification if subscription is already cancelled", async () => {
      const { service } = makeService({
        repo: {
          get: vi.fn().mockResolvedValue({ ...mockSub, status: "CANCELLED" }),
        },
      });

      await expect(
        service.modify(financeActor, mockSub.id, { expectedVersion: 1, amount: 600 }),
      ).rejects.toThrow(ServiceError);
    });
  });

  describe("Cancellation & Refund Trigger (T10.3)", () => {
    it("orchestrates pro-rata refund evaluation and passes to repository", async () => {
      const { service, repository } = makeService();

      const result = await service.cancel(financeActor, mockSub.id, {
        reason: "Customer requested cancellation",
        immediate: true,
        cancelDate: "2026-09-11T00:00:00.000Z",
        expectedVersion: 1,
      });

      expect(repository.cancel).toHaveBeenCalledWith(
        mockSub.id,
        expect.objectContaining({ expectedVersion: 1 }),
        expect.objectContaining({
          immediate: true,
          refundEligible: true,
          creditNoteRequired: true,
        }),
        financeActor,
      );
      expect(result.cancellation.refundAmount).toBe(200);
      expect(result.creditNote?.amount).toBe("200.00");
    });

    it("rejects cancel if subscription is already cancelled", async () => {
      const { service } = makeService({
        repo: {
          get: vi.fn().mockResolvedValue({ ...mockSub, status: "CANCELLED" }),
        },
      });

      await expect(
        service.cancel(financeActor, mockSub.id, { expectedVersion: 1 }),
      ).rejects.toThrow(ServiceError);
    });
  });
});
