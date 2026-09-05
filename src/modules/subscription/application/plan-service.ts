import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import { isValidCadence } from "../domain/cadence";
import { createPlanSchema, updatePlanSchema } from "../schemas/plan";
import type { CreatePlanInput, PlanListQuery, UpdatePlanInput } from "../schemas/plan";
import type { PlanRepository } from "./ports";

export class PlanService {
  constructor(private readonly repository: PlanRepository) {}

  async list(actor: Actor | null, query: PlanListQuery = {}) {
    requireInternal(actor);
    return this.repository.list(query);
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const plan = await this.repository.get(id);
    if (!plan) throw new ServiceError("NOT_FOUND", "Subscription plan not found", { id });
    return plan;
  }

  async create(actor: Actor | null, input: CreatePlanInput) {
    requireAdmin(actor);

    if (!isValidCadence(input.cadence)) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Invalid cadence '${String(input.cadence)}'. Cadence must be MONTHLY, QUARTERLY, or YEARLY.`,
        { cadence: input.cadence },
      );
    }

    const validated = createPlanSchema.parse(input);
    return this.repository.create(validated);
  }

  async update(actor: Actor | null, id: string, input: UpdatePlanInput) {
    requireAdmin(actor);

    if (input.cadence !== undefined && !isValidCadence(input.cadence)) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Invalid cadence '${String(input.cadence)}'. Cadence must be MONTHLY, QUARTERLY, or YEARLY.`,
        { cadence: input.cadence },
      );
    }

    const validated = updatePlanSchema.parse(input);
    const plan = await this.repository.update(id, validated);
    if (!plan) throw new ServiceError("NOT_FOUND", "Subscription plan not found", { id });
    return plan;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "Subscription plan not found", { id });
    }
  }
}
