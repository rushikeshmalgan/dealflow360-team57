import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireInternal, requireRole } from "@/modules/shared/domain/actor";

import { calculateCancellationRefund } from "../domain/cancellation";
import { calculateProration } from "../domain/proration";
import {
  cancelSubscriptionSchema,
  createBillingPlanFromQuotationSchema,
  createSubscriptionSchema,
  modifySubscriptionSchema,
  subscriptionListQuerySchema,
} from "../schemas/subscription";
import type {
  CancelSubscriptionInput,
  CreateBillingPlanFromQuotationInput,
  CreateSubscriptionInput,
  ModifySubscriptionInput,
  SubscriptionListQuery,
} from "../schemas/subscription";
import type { PlanRepository, SubscriptionRepository } from "./ports";

const SUBSCRIPTION_WRITE_ROLES = ["ADMIN", "FINANCE_OPS", "SALES_REP"] as const;
const SUBSCRIPTION_MANAGE_ROLES = ["ADMIN", "FINANCE_OPS", "MANAGER"] as const;

export class SubscriptionService {
  constructor(
    private readonly repository: SubscriptionRepository,
    private readonly planRepository: PlanRepository,
  ) {}

  async list(actor: Actor | null, query: SubscriptionListQuery = {}) {
    requireInternal(actor);
    const validated = subscriptionListQuerySchema.parse(query);
    return this.repository.list(validated);
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const subscription = await this.repository.get(id);
    if (!subscription) {
      throw new ServiceError("NOT_FOUND", "Subscription not found", { id });
    }
    return subscription;
  }

  async getBillingSchedules(actor: Actor | null, subscriptionId: string) {
    requireInternal(actor);
    // Ensure subscription exists
    await this.get(actor, subscriptionId);
    return this.repository.getBillingSchedules(subscriptionId);
  }

  async getBillingDetail(actor: Actor | null, subscriptionId: string) {
    requireInternal(actor);
    const detail = await this.repository.getBillingDetail(subscriptionId);
    if (!detail) {
      throw new ServiceError("NOT_FOUND", "Subscription not found", { id: subscriptionId });
    }
    return detail;
  }

  async create(actor: Actor | null, input: CreateSubscriptionInput) {
    requireRole(actor, SUBSCRIPTION_WRITE_ROLES);
    const validated = createSubscriptionSchema.parse(input);

    const plan = await this.planRepository.get(validated.planId);
    if (!plan) {
      throw new ServiceError("NOT_FOUND", "Subscription plan not found", {
        planId: validated.planId,
      });
    }

    return this.repository.create(validated, actor);
  }

  async createFromQuotation(actor: Actor | null, input: CreateBillingPlanFromQuotationInput) {
    requireRole(actor, SUBSCRIPTION_WRITE_ROLES);
    const validated = createBillingPlanFromQuotationSchema.parse(input);
    return this.repository.createFromQuotation(validated.quotationId, actor);
  }

  async modify(actor: Actor | null, id: string, input: ModifySubscriptionInput) {
    requireRole(actor, SUBSCRIPTION_MANAGE_ROLES);
    const validated = modifySubscriptionSchema.parse(input);

    const current = await this.repository.get(id);
    if (!current) {
      throw new ServiceError("NOT_FOUND", "Subscription not found", { id });
    }

    if (current.status === "CANCELLED") {
      throw new ServiceError(
        "INVALID_STATE_TRANSITION",
        "Cannot modify a cancelled subscription",
        { id, status: current.status },
      );
    }

    // Determine target plan and rules
    const targetPlanId = validated.planId ?? current.planId;
    const plan = await this.planRepository.get(targetPlanId);
    if (!plan) {
      throw new ServiceError("NOT_FOUND", "Subscription plan not found", {
        planId: targetPlanId,
      });
    }

    // Determine current billing schedule and amounts
    const schedules = await this.repository.getBillingSchedules(id);
    const activeSchedule = schedules[0]; // most recent active or upcoming

    const currentStartDate = activeSchedule
      ? new Date(activeSchedule.cycleStart)
      : new Date(current.startDate);
    const currentEndDate = activeSchedule
      ? new Date(activeSchedule.cycleEnd)
      : new Date(current.nextBillDate);
    const currentAmount = activeSchedule ? Number(activeSchedule.amount) : 0;

    const newAmount =
      validated.amount !== undefined
        ? validated.amount
        : plan.product?.price
          ? Number(plan.product.price)
          : currentAmount;

    const effectiveDate = validated.effectiveDate
      ? new Date(validated.effectiveDate)
      : new Date();

    const prorationResult = calculateProration({
      currentStartDate,
      currentEndDate,
      currentAmount,
      effectiveDate,
      newAmount,
      prorationRule: plan.prorationRule,
    });

    return this.repository.modify(id, validated, prorationResult, actor);
  }

  async cancel(actor: Actor | null, id: string, input: CancelSubscriptionInput) {
    requireRole(actor, SUBSCRIPTION_MANAGE_ROLES);
    const validated = cancelSubscriptionSchema.parse(input);

    const current = await this.repository.get(id);
    if (!current) {
      throw new ServiceError("NOT_FOUND", "Subscription not found", { id });
    }

    if (current.status === "CANCELLED") {
      throw new ServiceError(
        "INVALID_STATE_TRANSITION",
        "Subscription is already cancelled",
        { id, status: current.status },
      );
    }

    const plan = await this.planRepository.get(current.planId);
    const schedules = await this.repository.getBillingSchedules(id);
    const activeSchedule = schedules[0];

    const currentStartDate = activeSchedule
      ? new Date(activeSchedule.cycleStart)
      : new Date(current.startDate);
    const currentEndDate = activeSchedule
      ? new Date(activeSchedule.cycleEnd)
      : new Date(current.nextBillDate);
    const currentAmount = activeSchedule ? Number(activeSchedule.amount) : 0;

    const cancelDate = validated.cancelDate ? new Date(validated.cancelDate) : new Date();

    const cancellationResult = calculateCancellationRefund({
      currentStartDate,
      currentEndDate,
      currentAmount,
      cancelDate,
      immediate: validated.immediate ?? true,
      cancellationRule: plan?.cancellationRule,
      partialRefundRule: plan?.partialRefundRule,
    });

    return this.repository.cancel(id, validated, cancellationResult, actor);
  }
}
