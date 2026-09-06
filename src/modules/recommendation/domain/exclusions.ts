import type { RecommendationConfig } from "./config";
import type { Candidate, ExclusionReason } from "./types";

export type ExclusionCheckInput = {
  candidate: Candidate;
  /** From calculateLineMargin (quantity=1, no discounts) — null when the candidate's price is 0. */
  marginPct: number | null;
  /** Total available (unreserved) stock across warehouses. */
  availableQty: number;
  alreadyInQuoteProductIds: ReadonlySet<string>;
  /** Products with a prior ADDED or DISMISSED recommendation row for this quotation — sticky decisions never resurface. */
  alreadyDecidedProductIds: ReadonlySet<string>;
};

/**
 * TAD SS15: "Exclude products already in the quote, incompatible products, inactive products,
 * and candidates below the minimum margin." This app has no product-compatibility rules table
 * (see domain/score.ts's `compatibility` component comment), so "incompatible" narrows to what
 * the schema can actually express: a product already decided for this quotation (added or
 * dismissed — re-offering it would ignore the rep's own prior decision) and being out of stock
 * (an extension beyond the TAD's literal four exclusions, needed so ranking never recommends an
 * unavailable product). Checked in a fixed order so a candidate excluded for multiple reasons
 * always reports the same, most-specific one — order matters for reproducible tests.
 */
export function findExclusionReason(
  input: ExclusionCheckInput,
  config: RecommendationConfig,
): ExclusionReason | null {
  if (input.alreadyInQuoteProductIds.has(input.candidate.productId)) return "ALREADY_IN_QUOTE";
  if (!input.candidate.isActive) return "INACTIVE_PRODUCT";
  if (input.alreadyDecidedProductIds.has(input.candidate.productId)) return "ALREADY_DECIDED";
  if (input.availableQty <= 0) return "OUT_OF_STOCK";
  if (input.marginPct === null || input.marginPct < config.minMarginPct) return "BELOW_MINIMUM_MARGIN";
  return null;
}
