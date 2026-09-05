import { DiscountRuleService } from "./application/discount-rule-service";
import { PrismaDiscountRuleRepository } from "./infrastructure/prisma-discount-rule-repository";

export const discountRuleService = new DiscountRuleService(new PrismaDiscountRuleRepository());

export { DiscountRuleService } from "./application/discount-rule-service";
export type { DiscountRuleDto, ResolvedCeilingDto } from "./application/types";
export { resolveDiscountCeiling } from "./domain/resolve-ceiling";
export {
  calculateLineMargin,
  calculateQuotationMargin,
  combineDiscounts,
} from "./domain/calculate-discount-margin";
export type {
  CombineDiscountsInput,
  LineMarginInput,
  LineMarginResult,
  QuotationMarginResult,
} from "./domain/calculate-discount-margin";
export { RISK_CONFIG_V1, scoreRisk } from "./domain/scoreRisk";
export type {
  RiskBand,
  RiskConfig,
  RiskExplanation,
  RiskLineExplanation,
  RiskLineInput,
  RiskQuoteInput,
  RiskResult,
} from "./domain/scoreRisk";
