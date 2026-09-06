import type { RecommendationConfig } from "./config";
import type { AnchorLine, Candidate, RecommendationType } from "./types";

/**
 * TAD SS15 names UPSELL/CROSS_SELL as an output but does not define the classification rule —
 * this is that implementation decision, grounded in the app's own product/pricing data rather
 * than arbitrary UI logic: a candidate in the SAME category as an anchor line, priced at or
 * above `anchor.unitPrice * config.upsellPriceRatioThreshold`, is a higher-tier alternative
 * (UPSELL). Everything else — a different category, or a same-category product that isn't
 * meaningfully pricier — is a complementary add-on (CROSS_SELL).
 */
export function classifyRecommendation(
  candidate: Candidate,
  anchorLines: readonly AnchorLine[],
  config: RecommendationConfig,
): RecommendationType {
  const sameCategoryAnchor = anchorLines.find((line) => line.categoryId === candidate.categoryId);
  if (sameCategoryAnchor && candidate.price >= sameCategoryAnchor.unitPrice * config.upsellPriceRatioThreshold) {
    return "UPSELL";
  }
  return "CROSS_SELL";
}
