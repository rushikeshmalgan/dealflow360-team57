/**
 * Upsell/Cross-Sell recommendation types and a typed mock adapter.
 *
 * Per docs/DealFlow360_Technical_Architecture_Document.md, the eventual backend
 * (a RecommendationService behind GET /api/recommendations/:quotationId) returns
 * explainable, ranked candidates with reason codes, applicable promotion, and margin
 * impact, and excludes below-margin/incompatible/inactive products before the UI ever
 * sees them. RecommendationDto here is a superset of the PRD's minimal wire field
 * (`upsell_suggestions[] -> {product_id, name, margin_note}`) so this UI stays
 * compatible with that documented contract while surfacing the richer fields the TAD
 * describes.
 *
 * No scoring, margin calculation, or promotion-ranking logic lives in this file or
 * anywhere under src/components/recommendations — fetchMockRecommendations below is a
 * placeholder returning pre-computed, already-ranked mock data. Swap it for a real
 * fetcher with the same RecommendationFetcher signature once the backend module exists;
 * RecommendationPane does not need to change.
 */

export type RecommendationType = "UPSELL" | "CROSS_SELL";

export type RecommendationDto = {
  id: string;
  quotationId: string;
  type: RecommendationType;
  rank: number;
  score: number;
  product: {
    id: string;
    name: string;
    sku: string;
    price: string;
  };
  reasonCodes: string[];
  reason: string;
  promotion: {
    id: string;
    name: string;
    discountPct: string;
  } | null;
  marginImpact: {
    deltaAmount: string;
    deltaPct: string;
    resultingMarginPct: string;
  };
};

export type RecommendationViewModel = {
  id: string;
  quotationId: string;
  type: RecommendationType;
  rank: number;
  score: number;
  productId: string;
  productName: string;
  productSku: string;
  price: number;
  reason: string;
  reasonCodes: string[];
  promotion: { name: string; discountPct: number } | null;
  marginImpact: {
    deltaAmount: number;
    deltaPct: number;
    resultingMarginPct: number;
  };
};

/** Translates the wire DTO (Decimal fields as strings) into the shape components render, mirroring src/lib/products.ts's mapper pattern. */
export function mapRecommendationToViewModel(dto: RecommendationDto): RecommendationViewModel {
  return {
    id: dto.id,
    quotationId: dto.quotationId,
    type: dto.type,
    rank: dto.rank,
    score: dto.score,
    productId: dto.product.id,
    productName: dto.product.name,
    productSku: dto.product.sku,
    price: Number(dto.product.price),
    reason: dto.reason,
    reasonCodes: dto.reasonCodes,
    promotion: dto.promotion
      ? { name: dto.promotion.name, discountPct: Number(dto.promotion.discountPct) }
      : null,
    marginImpact: {
      deltaAmount: Number(dto.marginImpact.deltaAmount),
      deltaPct: Number(dto.marginImpact.deltaPct),
      resultingMarginPct: Number(dto.marginImpact.resultingMarginPct),
    },
  };
}

/** Display-order sort only (ascending rank). The rank itself is assigned upstream, not computed here. */
export function sortRecommendationsByRank(
  list: RecommendationViewModel[],
): RecommendationViewModel[] {
  return [...list].sort((a, b) => a.rank - b.rank);
}

export type RecommendationFetcher = (quotationId: string) => Promise<RecommendationDto[]>;

const MOCK_RECOMMENDATIONS: ReadonlyArray<Omit<RecommendationDto, "quotationId">> = [
  {
    id: "rec-mock-1",
    type: "UPSELL",
    rank: 1,
    score: 0.91,
    product: {
      id: "prod-mock-1",
      name: "Enterprise Support Plan",
      sku: "SUP-ENT-01",
      price: "4999.00",
    },
    reasonCodes: ["HIGHER_TIER", "FREQUENTLY_UPGRADED"],
    reason:
      "Customers on the Standard Support plan upgrade to Enterprise Support 68% of the time within a quarter.",
    promotion: { id: "promo-mock-1", name: "Q3 Support Upgrade", discountPct: "10.00" },
    marginImpact: { deltaAmount: "1450.00", deltaPct: "4.2", resultingMarginPct: "38.6" },
  },
  {
    id: "rec-mock-2",
    type: "CROSS_SELL",
    rank: 2,
    score: 0.84,
    product: {
      id: "prod-mock-2",
      name: "Onboarding Services Package",
      sku: "SVC-ONB-02",
      price: "1899.00",
    },
    reasonCodes: ["FREQUENTLY_CO_PURCHASED"],
    reason: "Purchased alongside a product on this quote in 54% of similar deals.",
    promotion: null,
    marginImpact: { deltaAmount: "612.00", deltaPct: "2.1", resultingMarginPct: "36.5" },
  },
  {
    id: "rec-mock-3",
    type: "CROSS_SELL",
    rank: 3,
    score: 0.77,
    product: {
      id: "prod-mock-3",
      name: "API Rate Limit Add-on",
      sku: "ADD-API-03",
      price: "749.00",
    },
    reasonCodes: ["FREQUENTLY_CO_PURCHASED", "PROMOTION_ACTIVE"],
    reason: "Commonly paired with this deal size and eligible for an active bundle promotion.",
    promotion: { id: "promo-mock-2", name: "API Bundle Discount", discountPct: "15.00" },
    marginImpact: { deltaAmount: "205.00", deltaPct: "1.1", resultingMarginPct: "35.9" },
  },
  {
    id: "rec-mock-4",
    type: "UPSELL",
    rank: 4,
    score: 0.69,
    product: {
      id: "prod-mock-4",
      name: "Premium Analytics Module",
      sku: "MOD-ANA-04",
      price: "2599.00",
    },
    reasonCodes: ["HIGHER_TIER"],
    reason: "A higher-tier module in the same category as a line already on this quote.",
    promotion: null,
    marginImpact: { deltaAmount: "890.00", deltaPct: "3.0", resultingMarginPct: "37.4" },
  },
];

/**
 * Placeholder standing in for the not-yet-built GET /api/recommendations/:quotationId.
 * Returns a fixed, already-ranked mock set tagged with the given quotationId. Resolves
 * after a short delay to exercise the pane's real loading state instead of always
 * resolving synchronously.
 */
export async function fetchMockRecommendations(quotationId: string): Promise<RecommendationDto[]> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  return MOCK_RECOMMENDATIONS.map((rec) => ({ ...rec, quotationId }));
}
