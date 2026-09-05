import { DiscountRuleService } from "./application/discount-rule-service";
import { PrismaDiscountRuleRepository } from "./infrastructure/prisma-discount-rule-repository";

export const discountRuleService = new DiscountRuleService(new PrismaDiscountRuleRepository());

export { DiscountRuleService } from "./application/discount-rule-service";
export type { DiscountRuleDto, ResolvedCeilingDto } from "./application/types";
export { resolveDiscountCeiling } from "./domain/resolve-ceiling";
