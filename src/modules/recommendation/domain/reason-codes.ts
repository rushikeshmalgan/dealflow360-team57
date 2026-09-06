import type { RecommendationConfig } from "./config";
import type { ScoreComponents } from "./score";
import type { ReasonCode, RecommendationType } from "./types";

/** Short, judge/rep-facing phrase per reason code (TAD SS15: "every score is explainable"). */
export const REASON_CODE_LABELS: Record<ReasonCode, string> = {
  HIGHER_TIER: "A higher-tier product in the same category as an existing line",
  COMPLEMENTARY_PRODUCT: "A complementary product frequently added alongside similar quotes",
  FREQUENTLY_CO_PURCHASED: "Frequently purchased together with products on this quote",
  PROMOTION_ACTIVE: "An active promotion applies to this product",
  HIGH_MARGIN: "Strong margin contribution",
  IN_STOCK: "Well stocked and ready to ship",
  POPULAR_WITH_YOUR_TIER: "Popular with customers on this account's tier",
};

export type ReasonResult = {
  reasonCodes: ReasonCode[];
  reason: string;
};

/** Composes the human-readable `reason` from a (possibly persisted-and-reloaded) list of reason
 * codes — pure and derived, so nothing needs to separately store the sentence itself. */
export function reasonTextFromCodes(reasonCodes: readonly ReasonCode[]): string {
  return reasonCodes
    .slice(0, 3)
    .map((code) => REASON_CODE_LABELS[code])
    .join(" · ");
}

/**
 * Deterministically derives explanation codes from the same normalized components that produced
 * the score, so the explanation can never drift from the number that ranked the candidate. The
 * classification code (HIGHER_TIER/COMPLEMENTARY_PRODUCT) always leads; the rest are included
 * only when their normalized component clears `config.reasonCodeThreshold`, ordered by weighted
 * contribution (impact on the final score) descending — the same ordering a rep would use to
 * judge which factor mattered most.
 */
export function buildReasonCodes(
  type: RecommendationType,
  components: ScoreComponents,
  weightedComponents: ScoreComponents,
  config: RecommendationConfig,
): ReasonResult {
  const classificationCode: ReasonCode = type === "UPSELL" ? "HIGHER_TIER" : "COMPLEMENTARY_PRODUCT";

  const candidates: Array<{ code: ReasonCode; value: number; weighted: number }> = [
    { code: "FREQUENTLY_CO_PURCHASED", value: components.coPurchase, weighted: weightedComponents.coPurchase },
    { code: "PROMOTION_ACTIVE", value: components.promotion, weighted: weightedComponents.promotion },
    { code: "HIGH_MARGIN", value: components.margin, weighted: weightedComponents.margin },
    { code: "IN_STOCK", value: components.availability, weighted: weightedComponents.availability },
    { code: "POPULAR_WITH_YOUR_TIER", value: components.tierAffinity, weighted: weightedComponents.tierAffinity },
  ];

  const qualifying = candidates
    .filter((c) => c.value > config.reasonCodeThreshold)
    .sort((a, b) => b.weighted - a.weighted)
    .map((c) => c.code);

  const reasonCodes = [classificationCode, ...qualifying];
  return { reasonCodes, reason: reasonTextFromCodes(reasonCodes) };
}
