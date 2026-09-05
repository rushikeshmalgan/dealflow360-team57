import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { CreateTierInput, UpdateTierInput } from "../schemas/tier";
import type { TierRepository } from "./ports";

export class TierService {
  constructor(private readonly repository: TierRepository) {}

  list(actor: Actor | null) {
    requireInternal(actor);
    return this.repository.list();
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const tier = await this.repository.get(id);
    if (!tier) throw new ServiceError("NOT_FOUND", "Customer tier not found", { id });
    return tier;
  }

  create(actor: Actor | null, input: CreateTierInput) {
    requireAdmin(actor);
    return this.repository.create(input);
  }

  async update(actor: Actor | null, id: string, input: UpdateTierInput) {
    requireAdmin(actor);
    const tier = await this.repository.update(id, input);
    if (!tier) throw new ServiceError("NOT_FOUND", "Customer tier not found", { id });
    return tier;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "Customer tier not found", { id });
    }
  }
}
