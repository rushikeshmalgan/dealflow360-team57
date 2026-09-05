import type { SubscriptionCadence } from "../domain/cadence";

export type SubscriptionPlanDto = {
  id: string;
  name: string;
  cadence: SubscriptionCadence;
  productId: string | null;
  product?: {
    id: string;
    sku: string;
    name: string;
    price: string;
  } | null;
  prorationRule: Record<string, unknown>;
  cancellationRule: Record<string, unknown>;
  partialRefundRule: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillingScheduleDto = {
  id: string;
  subscriptionId: string;
  cycleStart: string;
  cycleEnd: string;
  amount: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionDto = {
  id: string;
  customerId: string;
  customer?: { id: string; name: string } | null;
  quotationId: string | null;
  planId: string;
  plan?: SubscriptionPlanDto | null;
  cycle: SubscriptionCadence;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  startDate: string;
  nextBillDate: string;
  version: number;
  billingSchedules?: BillingScheduleDto[];
  createdAt: string;
  updatedAt: string;
};

export type BillingDetailDto = {
  subscription: SubscriptionDto;
  customerName: string;
  planName: string;
  cycle: string;
  nextBillDate: string;
  originatingOrder: {
    quotationId: string | null;
    oneTimeLines: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: string;
      amount: string;
    }>;
  };
  recurringLines: Array<{
    id: string;
    planName: string;
    cycle: string;
    nextBillDate: string;
    amount: string;
  }>;
  billingSchedules: BillingScheduleDto[];
};

export type SubscriptionModificationDto = {
  subscription: SubscriptionDto;
  proration: {
    strategy: string;
    totalCycleDays: number;
    daysElapsed: number;
    daysRemaining: number;
    currentAmount: number;
    usedAmount: number;
    unusedCredit: number;
    newAmount: number;
    newProratedCharge: number;
    netAdjustment: number;
    isUpgrade: boolean;
    explanation: string;
  };
  schedule: BillingScheduleDto;
};

export type SubscriptionCancellationDto = {
  subscription: SubscriptionDto;
  cancellation: {
    effectiveCancellationDate: string;
    immediate: boolean;
    policy: string;
    refundEligible: boolean;
    creditNoteRequired: boolean;
    refundAmount: number;
    explanation: string;
  };
  creditNote?: {
    id: string;
    invoiceId: string;
    amount: string;
    reason: string | null;
    createdAt: string;
  } | null;
};

export type BillingPlanCreationResultDto = {
  quotationId: string;
  invoice: {
    id: string;
    invoiceCode: string;
    totalAmount: string;
    lineCount: number;
  } | null;
  subscriptions: SubscriptionDto[];
};
