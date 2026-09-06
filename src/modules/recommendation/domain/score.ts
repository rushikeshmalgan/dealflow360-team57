/**
 * T-Upsell.2 — pure weighted scoring utility implementing TAD SS15's exact formula:
 *
 *   score = alpha*coPurchase + beta*promotion + gamma*margin
 *         + delta*compatibility + epsilon*availability + zeta*tierAffinity
 *
 * No Next.js/Prisma dependency (TAD SS31), mirroring discount-risk/domain/scoreRisk.ts. The TAD
 * names these six components and requires each normalized to [0,1] but does not define how each
 * is computed from this app's data — that is this function's implementation decision, documented
 * per component below:
 *
 * - coPurchase: this candidate's raw co-occurrence count with the quote's anchor products,
 *   divided by the highest co-occurrence count seen across the whole candidate set (relative
 *   popularity within this ranking pass, since there is no fixed catalog-wide denominator).
 *   0 when there is no purchase history at all (ADR-010: "quality depends on weights/history").
 * - promotion: whether an active DiscountRule applies to this candidate (this app's closest
 *   existing "active promotion" concept — there is no separate Promotion/campaign table),
 *   scaled by that rule's maxDiscountPct against a configurable ceiling.
 * - margin: the candidate's own margin % (quantity=1, no discounts — from calculateLineMargin,
 *   never re-derived here) against a configurable ceiling.
 * - compatibility: always 1. This schema has no product-compatibility/exclusion-pairing table,
 *   so every candidate that survives domain/exclusions.ts is, by definition, not known to be
 *   incompatible — the weight is a documented no-op placeholder until such a table exists.
 * - availability: total available (unreserved) stock against a configurable ceiling. Zero-stock
 *   candidates never reach scoring (excluded upstream), so this only ranks among in-stock ones.
 * - tierAffinity: what fraction of this candidate's own purchase history comes from customers in
 *   the same CustomerTier as this quotation's customer (0 when the candidate has no history).
 */

import type { RecommendationConfig } from "./config";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type ScoreComponentsInput = {
  coOccurrenceCount: number;
  /** Highest coOccurrenceCount across the full candidate set being scored together. */
  maxCoOccurrenceCount: number;
  matchedPromotionMaxDiscountPct: number | null;
  marginPct: number;
  availableQty: number;
  tierAffinitySameTierCount: number;
  tierAffinityTotalCount: number;
};

export type ScoreComponents = {
  coPurchase: number;
  promotion: number;
  margin: number;
  compatibility: number;
  availability: number;
  tierAffinity: number;
};

export type ScoreResult = {
  score: number;
  configVersion: number;
  components: ScoreComponents;
  /** Each component's weighted contribution (component * its weight) — what actually sums to `score`, used for explainable reasonCodes. */
  weightedComponents: ScoreComponents;
};

export function computeScoreComponents(
  input: ScoreComponentsInput,
  config: RecommendationConfig,
): ScoreComponents {
  const coPurchase =
    input.maxCoOccurrenceCount <= 0 ? 0 : clamp01(input.coOccurrenceCount / input.maxCoOccurrenceCount);

  const promotion =
    input.matchedPromotionMaxDiscountPct === null
      ? 0
      : clamp01(input.matchedPromotionMaxDiscountPct / config.promotionDiscountNormalizationPct);

  const margin = clamp01(input.marginPct / config.marginNormalizationCeilingPct);

  const compatibility = 1;

  const availability = clamp01(input.availableQty / config.availabilityCeilingQty);

  const tierAffinity =
    input.tierAffinityTotalCount <= 0
      ? 0
      : clamp01(input.tierAffinitySameTierCount / input.tierAffinityTotalCount);

  return { coPurchase, promotion, margin, compatibility, availability, tierAffinity };
}

export function scoreCandidate(
  input: ScoreComponentsInput,
  config: RecommendationConfig,
): ScoreResult {
  const components = computeScoreComponents(input, config);

  const weightedComponents: ScoreComponents = {
    coPurchase: config.weights.coPurchase * components.coPurchase,
    promotion: config.weights.promotion * components.promotion,
    margin: config.weights.margin * components.margin,
    compatibility: config.weights.compatibility * components.compatibility,
    availability: config.weights.availability * components.availability,
    tierAffinity: config.weights.tierAffinity * components.tierAffinity,
  };

  const score = clamp01(
    weightedComponents.coPurchase +
      weightedComponents.promotion +
      weightedComponents.margin +
      weightedComponents.compatibility +
      weightedComponents.availability +
      weightedComponents.tierAffinity,
  );

  return { score, configVersion: config.version, components, weightedComponents };
}
