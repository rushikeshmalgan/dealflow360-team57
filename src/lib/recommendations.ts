/**
 * Upsell/Cross-Sell recommendation types and adapters.
 *
 * Per docs/DealFlow360_Technical_Architecture_Document.md SS15, the backend (RecommendationService,
 * src/modules/recommendation) is now live behind POST /api/recommendations (generate),
 * GET /api/recommendations/quotations/:id (list current), and the add-to-quote/dismiss actions
 * below. RecommendationDto here is a superset of the PRD's minimal wire field
 * (`upsell_suggestions[] -> {product_id, name, margin_note}`), matching the backend's
 * RecommendationDto (src/modules/recommendation/application/types.ts) field for field.
 *
 * No scoring, margin calculation, or promotion-ranking logic lives in this file or anywhere
 * under src/components/recommendations — fetchRecommendations below only calls the backend and
 * reshapes its response; fetchMockRecommendations remains available (e.g. for the pane rendered
 * standalone, without a real quotation) as a typed placeholder. Both share the same
 * RecommendationFetcher signature, so RecommendationPane never needs to change.
 */

import { apiRequest } from "@/lib/api-client";

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

/** Backend wire shape differs from the frontend's only in one field's nullability — see adaptBackendDto. */
type BackendRecommendationDto = Omit<RecommendationDto, "marginImpact"> & {
  marginImpact: { deltaAmount: string; deltaPct: string; resultingMarginPct: string | null };
};

/**
 * The backend's `resultingMarginPct` is nullable (a candidate combined with a zero-revenue quote
 * has no defined margin %, matching calculateQuotationMargin's own `marginPct: number | null`);
 * this UI has always rendered it as a plain string, so the adapter — not the already-shipped
 * RecommendationCard — absorbs that difference.
 */
function adaptBackendDto(dto: BackendRecommendationDto): RecommendationDto {
  return {
    ...dto,
    marginImpact: { ...dto.marginImpact, resultingMarginPct: dto.marginImpact.resultingMarginPct ?? "0" },
  };
}

/** Real backend fetcher (src/modules/recommendation): generates and returns the current top-K
 * for a quotation. Safe to call repeatedly — generation is idempotent and sticky against prior
 * Add to Quote/Dismiss decisions (see the Recommendation model's Prisma comment). */
export async function fetchRecommendations(quotationId: string): Promise<RecommendationDto[]> {
  const results = await apiRequest<BackendRecommendationDto[]>("/api/recommendations", {
    method: "POST",
    body: JSON.stringify({ quotationId }),
  });
  return results.map(adaptBackendDto);
}

export async function addRecommendationToQuote(
  recommendationId: string,
  expectedVersion: number,
): Promise<{ quotationId: string; recommendation: RecommendationDto }> {
  const result = await apiRequest<{ quotationId: string; recommendation: BackendRecommendationDto }>(
    `/api/recommendations/${recommendationId}/add-to-quote`,
    { method: "POST", body: JSON.stringify({ expectedVersion }) },
  );
  return { quotationId: result.quotationId, recommendation: adaptBackendDto(result.recommendation) };
}

export async function dismissRecommendation(recommendationId: string): Promise<RecommendationDto> {
  const result = await apiRequest<BackendRecommendationDto>(
    `/api/recommendations/${recommendationId}/dismiss`,
    { method: "POST" },
  );
  return adaptBackendDto(result);
}
