/**
 * Versioned deterministic configuration for TAD SS15's weighted recommendation score:
 *
 *   score = alpha*coPurchase + beta*promotion + gamma*margin
 *         + delta*compatibility + epsilon*availability + zeta*tierAffinity
 *
 * mirroring discount-risk/domain/scoreRisk.ts's RISK_CONFIG_V1 pattern: bump `version` (and
 * export a new object) whenever a weight/threshold changes, so a persisted recommendation's
 * `configVersion` stays explainable against the config that produced it. The TAD names these
 * six components and says "normalize to [0,1]; store weights in recommendation_config" but does
 * not specify how each component is computed — that is this module's implementation decision,
 * documented next to each component in domain/score.ts. `recommendation_config` itself is
 * implemented as this versioned in-code constant (like DEAL_HEALTH_CONFIG_V1 and
 * RISK_CONFIG_V1) rather than a DB-editable table, since no PRD screen or ticket requests a
 * weight-tuning UI.
 */
export type RecommendationConfig = {
  version: number;
  weights: {
    coPurchase: number;
    promotion: number;
    margin: number;
    compatibility: number;
    availability: number;
    tierAffinity: number;
  };
  /** TAD SS15: "Exclude ... candidates below the minimum margin." Margin % (0-100) floor a candidate's own margin must clear to be considered at all. */
  minMarginPct: number;
  /** TAD SS15/§48: "top-5 deterministic recommendations." */
  topK: number;
  /** TAD SS16 ADR-009: "Use a size-k min-heap only when the catalog is large enough that top-K selection matters" — sort below this candidate count, min-heap at/above it. */
  heapThreshold: number;
  /** Normalizes the `margin` score component: a candidate's own margin % divided by this ceiling, clamped to [0,1]. */
  marginNormalizationCeilingPct: number;
  /** Normalizes the `promotion` score component: the matched DiscountRule's maxDiscountPct divided by this ceiling, clamped to [0,1]. */
  promotionDiscountNormalizationPct: number;
  /** Normalizes the `availability` score component: total available stock divided by this ceiling, clamped to [0,1]. Candidates with zero stock never reach scoring at all (domain/exclusions.ts), so this only differentiates among in-stock candidates. */
  availabilityCeilingQty: number;
  /**
   * Classification threshold (domain/classify.ts): within the same product category as an
   * anchor line, a candidate priced at or above `anchor unit price * this ratio` is an UPSELL
   * (a higher tier of what's already on the quote); otherwise, or in a different category,
   * it's a CROSS_SELL (a complementary product). Not defined by the TAD — an implementation
   * decision grounded in the app's actual pricing data (Product.price, Product.categoryId)
   * rather than arbitrary UI logic.
   */
  upsellPriceRatioThreshold: number;
  /** reasonCodes/domain thresholds: a normalized component must exceed this to earn its reason code. */
  reasonCodeThreshold: number;
};

export const RECOMMENDATION_CONFIG_V1: RecommendationConfig = {
  version: 1,
  weights: {
    coPurchase: 0.3,
    promotion: 0.15,
    margin: 0.2,
    compatibility: 0.1,
    availability: 0.15,
    tierAffinity: 0.1,
  },
  minMarginPct: 15,
  topK: 5,
  heapThreshold: 50,
  marginNormalizationCeilingPct: 60,
  promotionDiscountNormalizationPct: 50,
  availabilityCeilingQty: 50,
  upsellPriceRatioThreshold: 1.15,
  reasonCodeThreshold: 0.34,
};
