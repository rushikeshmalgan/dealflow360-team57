import type { Actor } from "@/modules/shared/domain/actor";

import type { CreateDiscountRuleInput, DiscountRuleQuery, UpdateDiscountRuleInput } from "../schemas/discount-rule";
import type { DiscountRuleDto, ResolvedCeilingDto } from "./types";

export interface DiscountRuleRepository {
  list(query: DiscountRuleQuery): Promise<DiscountRuleDto[]>;
  get(id: string): Promise<DiscountRuleDto | null>;
  create(input: CreateDiscountRuleInput, actor: Actor): Promise<DiscountRuleDto>;
  update(id: string, input: UpdateDiscountRuleInput, actor: Actor): Promise<DiscountRuleDto | null>;
  delete(id: string, actor: Actor): Promise<boolean>;
  resolveCeiling(tierId: string, categoryId: string | null): Promise<ResolvedCeilingDto>;
}
