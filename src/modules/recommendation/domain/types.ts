export const RECOMMENDATION_TYPES = ["UPSELL", "CROSS_SELL"] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_EVALUATE_EVENT = "recommendation.evaluate" as const;

/** One anchor line already on the quotation — the "already purchased" side of co-purchase/classification. */
export type AnchorLine = {
  productId: string;
  categoryId: string;
  unitPrice: number;
};

/** One candidate product being considered. Exclusion (inactive, already in quote, already
 * decided, below margin, out of stock) is decided in domain/exclusions.ts, not by the query
 * that produces this list, so the rule stays a single explainable, testable place. */
export type Candidate = {
  productId: string;
  name: string;
  sku: string;
  categoryId: string;
  price: number;
  costPrice: number;
  isSubscription: boolean;
  isActive: boolean;
};

export type CandidateSignals = {
  /** Raw co-occurrence count with the quote's anchor products, before normalization (domain/score.ts normalizes by the max across the candidate set). */
  coOccurrenceCount: number;
  /** The best active DiscountRule applicable to this candidate's category or the customer's tier, if any. */
  matchedPromotion: { discountRuleId: string; maxDiscountPct: number } | null;
  /** Total available (unreserved) stock across warehouses. */
  availableQty: number;
  /** How much of this product's own purchase history comes from customers in the same tier as this quotation's customer. */
  tierAffinity: { sameTierCount: number; totalCount: number };
};

export type ExclusionReason =
  | "ALREADY_IN_QUOTE"
  | "INACTIVE_PRODUCT"
  | "BELOW_MINIMUM_MARGIN"
  | "OUT_OF_STOCK"
  | "ALREADY_DECIDED";

export const REASON_CODES = [
  "FREQUENTLY_CO_PURCHASED",
  "PROMOTION_ACTIVE",
  "HIGH_MARGIN",
  "HIGHER_TIER",
  "COMPLEMENTARY_PRODUCT",
  "IN_STOCK",
  "POPULAR_WITH_YOUR_TIER",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
