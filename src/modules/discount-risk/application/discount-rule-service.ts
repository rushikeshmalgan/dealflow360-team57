import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { CreateDiscountRuleInput, DiscountRuleQuery, UpdateDiscountRuleInput } from "../schemas/discount-rule";
import type { DiscountRuleRepository } from "./ports";

export class DiscountRuleService {
  constructor(private readonly repository: DiscountRuleRepository) {}

  list(actor: Actor | null, query: DiscountRuleQuery = {}) {
    requireInternal(actor);
    return this.repository.list(query);
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const rule = await this.repository.get(id);
    if (!rule) throw new ServiceError("NOT_FOUND", "Discount rule not found", { id });
    return rule;
  }

  create(actor: Actor | null, input: CreateDiscountRuleInput) {
    requireAdmin(actor);
    return this.repository.create(input, actor);
  }

  async update(actor: Actor | null, id: string, input: UpdateDiscountRuleInput) {
    requireAdmin(actor);
    const rule = await this.repository.update(id, input, actor);
    if (!rule) throw new ServiceError("NOT_FOUND", "Discount rule not found", { id });
    return rule;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id, actor))) {
      throw new ServiceError("NOT_FOUND", "Discount rule not found", { id });
    }
  }

  /**
   * Canonical tier/category ceiling lookup. TAD SS10: lower ceiling wins when both exist.
   * This is the only place downstream discount/risk evaluation (T6.4/T7.2) should call —
   * they must not re-derive the ceiling by querying discount_rules themselves.
   */
  resolveCeiling(actor: Actor | null, tierId: string, categoryId: string | null = null) {
    requireInternal(actor);
    return this.repository.resolveCeiling(tierId, categoryId);
  }
}
