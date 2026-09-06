import type { RecommendationType } from "../domain/types";

export type RecommendationStatus = "PENDING" | "ADDED" | "DISMISSED";

/** Wire shape — matches src/lib/recommendations.ts's RecommendationDto on the frontend field for
 * field, so the Phase 1 UI's fetcher swap needs no reshaping. */
export type RecommendationDto = {
  id: string;
  quotationId: string;
  type: RecommendationType;
  rank: number;
  score: number;
  product: { id: string; name: string; sku: string; price: string };
  reasonCodes: string[];
  reason: string;
  promotion: { id: string; name: string; discountPct: string } | null;
  marginImpact: { deltaAmount: string; deltaPct: string; resultingMarginPct: string | null };
};

/**
 * Everything one generation pass needs for a quotation, pre-joined by the repository so the
 * service stays free of Prisma — mirrors deal-health's QuotationHealthSnapshot pattern.
 */
export type ScoringContext = {
  quotation: {
    id: string;
    status: string;
    salesRepId: string;
    customerId: string;
    customerTierId: string;
    priceListId: string;
    currency: string;
    /** 0-100 percentage — same field calculateLineMargin expects, reused verbatim for the margin-impact preview. */
    orderDiscountPct: number;
  };
  /** Products already on the quote — the "already purchased" side of co-purchase/classification,
   * and (with quantity/costPrice/lineDiscountPct) enough to recompute the quote's current margin
   * via the existing calculateLineMargin/calculateQuotationMargin utilities for the "projected
   * margin impact" preview, without duplicating that arithmetic. */
  anchorLines: Array<{
    productId: string;
    categoryId: string;
    unitPrice: number;
    quantity: number;
    costPrice: number;
    lineDiscountPct: number;
  }>;
  /** Active products not already on the quote. Exclusion (inactive, below margin, out of stock,
   * already decided) happens in domain/exclusions.ts, not this query. */
  candidates: Array<{
    productId: string;
    name: string;
    sku: string;
    categoryId: string;
    price: number;
    costPrice: number;
    isSubscription: boolean;
    isActive: boolean;
  }>;
  /** Raw co-occurrence count (# of quotation_lines rows) with any anchor product, per candidate productId. */
  coOccurrenceCounts: Record<string, number>;
  /** Best active DiscountRule matching each candidate's category or the customer's tier, if any. */
  matchedPromotions: Record<string, { discountRuleId: string; maxDiscountPct: number } | undefined>;
  /** Total available (unreserved) stock across warehouses, per candidate productId. */
  stockByProduct: Record<string, number>;
  /** This candidate's own purchase history, split by whether the buying customer shares this quotation's tier. */
  tierAffinity: Record<string, { sameTierCount: number; totalCount: number }>;
  /** productId -> status, for every prior Recommendation row on this quotation (sticky ADDED/DISMISSED guard). */
  existingDecisions: Record<string, RecommendationStatus>;
};

export type GeneratedRecommendationRow = {
  productId: string;
  type: RecommendationType;
  rank: number;
  score: number;
  /** `reason` (human text) is deliberately not stored — it's derived from reasonCodes at read
   * time via domain/reason-codes.ts's reasonTextFromCodes, the single source of truth for that
   * composition. */
  reasonCodes: string[];
  promotionDiscountRuleId: string | null;
  projectedMarginDeltaAmount: number;
  projectedMarginDeltaPct: number;
  projectedResultingMarginPct: number | null;
};

/** Authorization + mutation context for one recommendation row (add-to-quote / dismiss). */
export type RecommendationOwnership = {
  id: string;
  quotationId: string;
  productId: string;
  status: RecommendationStatus;
  salesRepId: string;
  productIsSubscription: boolean;
};
