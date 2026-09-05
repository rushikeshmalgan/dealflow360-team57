import type { CreatePlanOutput, PlanListQuery, UpdatePlanOutput } from "../schemas/plan";
import type { SubscriptionPlanDto } from "./types";

export interface PlanRepository {
  list(query: PlanListQuery): Promise<SubscriptionPlanDto[]>;
  get(id: string): Promise<SubscriptionPlanDto | null>;
  getByName(name: string): Promise<SubscriptionPlanDto | null>;
  create(input: CreatePlanOutput): Promise<SubscriptionPlanDto>;
  update(id: string, input: UpdatePlanOutput): Promise<SubscriptionPlanDto | null>;
  delete(id: string): Promise<boolean>;
}
