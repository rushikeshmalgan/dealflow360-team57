import type { Actor } from "@/modules/shared/domain/actor";

import type { CancellationResult } from "../domain/cancellation";
import type { ProrationResult } from "../domain/proration";
import type { CreatePlanOutput, PlanListQuery, UpdatePlanOutput } from "../schemas/plan";
import type {
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  ModifySubscriptionInput,
  SubscriptionListQuery,
} from "../schemas/subscription";
import type {
  BillingDetailDto,
  BillingPlanCreationResultDto,
  BillingScheduleDto,
  SubscriptionCancellationDto,
  SubscriptionDto,
  SubscriptionModificationDto,
  SubscriptionPlanDto,
} from "./types";

export interface PlanRepository {
  list(query: PlanListQuery): Promise<SubscriptionPlanDto[]>;
  get(id: string): Promise<SubscriptionPlanDto | null>;
  getByName(name: string): Promise<SubscriptionPlanDto | null>;
  create(input: CreatePlanOutput): Promise<SubscriptionPlanDto>;
  update(id: string, input: UpdatePlanOutput): Promise<SubscriptionPlanDto | null>;
  delete(id: string): Promise<boolean>;
}

export interface SubscriptionRepository {
  list(query: SubscriptionListQuery): Promise<SubscriptionDto[]>;
  get(id: string): Promise<SubscriptionDto | null>;
  getBillingSchedules(subscriptionId: string): Promise<BillingScheduleDto[]>;
  getBillingDetail(subscriptionId: string): Promise<BillingDetailDto | null>;
  create(input: CreateSubscriptionInput, actor: Actor): Promise<SubscriptionDto>;
  createFromQuotation(quotationId: string, actor: Actor): Promise<BillingPlanCreationResultDto>;
  modify(
    id: string,
    input: ModifySubscriptionInput,
    prorationResult: ProrationResult,
    actor: Actor,
  ): Promise<SubscriptionModificationDto>;
  cancel(
    id: string,
    input: CancelSubscriptionInput,
    cancellationResult: CancellationResult,
    actor: Actor,
  ): Promise<SubscriptionCancellationDto>;
}
