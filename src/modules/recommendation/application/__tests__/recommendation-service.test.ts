import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import { RECOMMENDATION_CONFIG_V1 } from "../../domain/config";
import { RecommendationService } from "../recommendation-service";
import type { RecommendationRepository } from "../ports";
import type {
  GeneratedRecommendationRow,
  RecommendationDto,
  RecommendationOwnership,
  ScoringContext,
} from "../types";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/realtime/emit", () => ({ emitRealtimeEvent: vi.fn() }));

const addLineMock = vi.fn();
vi.mock("@/modules/quotation", () => ({ quotationService: { addLine: (...args: unknown[]) => addLineMock(...args) } }));

const REP: Actor = { id: "rep-1", role: "SALES_REP" };
const OTHER_REP: Actor = { id: "rep-2", role: "SALES_REP" };
const MANAGER: Actor = { id: "mgr-1", role: "MANAGER" };

function baseContext(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    quotation: {
      id: "quote-1",
      status: "DRAFT",
      salesRepId: REP.id,
      customerId: "cust-1",
      customerTierId: "tier-1",
      priceListId: "pl-1",
      currency: "USD",
      orderDiscountPct: 0,
    },
    anchorLines: [{ productId: "prod-anchor", categoryId: "cat-1", unitPrice: 100, quantity: 1, costPrice: 60, lineDiscountPct: 0 }],
    candidates: [
      {
        productId: "prod-candidate",
        name: "Widget Pro",
        sku: "WID-PRO",
        categoryId: "cat-2",
        price: 200,
        costPrice: 80,
        isSubscription: false,
        isActive: true,
      },
    ],
    coOccurrenceCounts: { "prod-candidate": 5 },
    matchedPromotions: {},
    stockByProduct: { "prod-candidate": 20 },
    tierAffinity: { "prod-candidate": { sameTierCount: 2, totalCount: 4 } },
    existingDecisions: {},
    ...overrides,
  };
}

function recommendationDto(overrides: Partial<RecommendationDto> = {}): RecommendationDto {
  return {
    id: "rec-1",
    quotationId: "quote-1",
    type: "CROSS_SELL",
    rank: 1,
    score: 0.5,
    product: { id: "prod-candidate", name: "Widget Pro", sku: "WID-PRO", price: "200.00" },
    reasonCodes: ["COMPLEMENTARY_PRODUCT"],
    reason: "A complementary product frequently added alongside similar quotes",
    promotion: null,
    marginImpact: { deltaAmount: "120.00", deltaPct: "1.0", resultingMarginPct: "40.0" },
    ...overrides,
  };
}

class FakeRecommendationRepository implements RecommendationRepository {
  context: ScoringContext | null = baseContext();
  ownershipByQuotationId = new Map<string, { salesRepId: string }>([["quote-1", { salesRepId: REP.id }]]);
  recommendationById = new Map<string, RecommendationOwnership>();
  pendingByQuotationId = new Map<string, RecommendationDto[]>();
  savedRows: GeneratedRecommendationRow[] = [];
  markAddedCalls: Array<{ id: string; lineId: string }> = [];
  markDismissedCalls: Array<{ id: string; userId: string }> = [];

  async getScoringContext(quotationId: string): Promise<ScoringContext | null> {
    return this.context && this.context.quotation.id === quotationId ? this.context : null;
  }

  async saveGenerated(quotationId: string, rows: GeneratedRecommendationRow[]): Promise<RecommendationDto[]> {
    this.savedRows = rows;
    const dtos = rows.map((row, index) =>
      recommendationDto({ id: `rec-${index}`, quotationId, rank: row.rank, score: row.score, reasonCodes: row.reasonCodes, type: row.type }),
    );
    this.pendingByQuotationId.set(quotationId, dtos);
    return dtos;
  }

  async listPending(quotationId: string): Promise<RecommendationDto[]> {
    return this.pendingByQuotationId.get(quotationId) ?? [];
  }

  async getQuotationOwnership(quotationId: string): Promise<{ salesRepId: string } | null> {
    return this.ownershipByQuotationId.get(quotationId) ?? null;
  }

  async getForActor(recommendationId: string): Promise<RecommendationOwnership | null> {
    return this.recommendationById.get(recommendationId) ?? null;
  }

  async markAdded(recommendationId: string, quotationLineId: string): Promise<RecommendationDto> {
    this.markAddedCalls.push({ id: recommendationId, lineId: quotationLineId });
    const existing = this.recommendationById.get(recommendationId);
    if (existing) this.recommendationById.set(recommendationId, { ...existing, status: "ADDED" });
    return recommendationDto({ id: recommendationId });
  }

  async markDismissed(recommendationId: string, dismissedByUserId: string): Promise<RecommendationDto> {
    this.markDismissedCalls.push({ id: recommendationId, userId: dismissedByUserId });
    const existing = this.recommendationById.get(recommendationId);
    if (existing) this.recommendationById.set(recommendationId, { ...existing, status: "DISMISSED" });
    return recommendationDto({ id: recommendationId });
  }
}

let repository: FakeRecommendationRepository;
let service: RecommendationService;

beforeEach(() => {
  repository = new FakeRecommendationRepository();
  service = new RecommendationService(repository, RECOMMENDATION_CONFIG_V1);
  addLineMock.mockReset();
});

describe("RecommendationService.generate", () => {
  it("scores, classifies, and persists an eligible candidate", async () => {
    const result = await service.generate(REP, "quote-1");
    expect(result).toHaveLength(1);
    expect(repository.savedRows).toHaveLength(1);
    expect(repository.savedRows[0].productId).toBe("prod-candidate");
    expect(repository.savedRows[0].rank).toBe(1);
    expect(repository.savedRows[0].score).toBeGreaterThan(0);
  });

  it("classifies a same-category, meaningfully pricier candidate as UPSELL", async () => {
    repository.context = baseContext({
      candidates: [
        {
          productId: "prod-candidate",
          name: "Bigger Widget",
          sku: "WID-BIG",
          categoryId: "cat-1", // same category as the anchor line
          price: 200, // well above anchor's 100 * 1.15 threshold
          costPrice: 80,
          isSubscription: false,
          isActive: true,
        },
      ],
    });
    await service.generate(REP, "quote-1");
    expect(repository.savedRows[0].type).toBe("UPSELL");
  });

  it("excludes a candidate below the configured minimum margin", async () => {
    repository.context = baseContext({
      candidates: [
        {
          productId: "prod-candidate",
          name: "Thin Margin",
          sku: "WID-THIN",
          categoryId: "cat-2",
          price: 100,
          costPrice: 95, // ~5% margin, below the 15% floor
          isSubscription: false,
          isActive: true,
        },
      ],
    });
    const result = await service.generate(REP, "quote-1");
    expect(result).toHaveLength(0);
  });

  it("excludes an out-of-stock candidate", async () => {
    repository.context = baseContext({ stockByProduct: { "prod-candidate": 0 } });
    const result = await service.generate(REP, "quote-1");
    expect(result).toHaveLength(0);
  });

  it("excludes a product already decided (added or dismissed) for this quotation", async () => {
    repository.context = baseContext({ existingDecisions: { "prod-candidate": "DISMISSED" } });
    const result = await service.generate(REP, "quote-1");
    expect(result).toHaveLength(0);
  });

  it("throws NOT_FOUND for a quotation that doesn't exist", async () => {
    repository.context = null;
    await expect(service.generate(REP, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forbids a sales rep from generating recommendations for another rep's quotation", async () => {
    await expect(service.generate(OTHER_REP, "quote-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a manager to view/generate across quotations (read-only role parity with QuotationService)", async () => {
    await expect(service.generate(MANAGER, "quote-1")).resolves.toHaveLength(1);
  });

  it("computes a projected margin impact using calculateLineMargin/calculateQuotationMargin, not an invented number", async () => {
    await service.generate(REP, "quote-1");
    const row = repository.savedRows[0];
    // price 200, cost 80, qty 1, no discounts -> marginAmount 120.
    expect(row.projectedMarginDeltaAmount).toBeCloseTo(120);
    expect(row.projectedResultingMarginPct).not.toBeNull();
  });
});

describe("RecommendationService.list", () => {
  it("returns the quotation's pending recommendations", async () => {
    repository.pendingByQuotationId.set("quote-1", [recommendationDto()]);
    const result = await service.list(REP, "quote-1");
    expect(result).toHaveLength(1);
  });

  it("throws NOT_FOUND for an unknown quotation", async () => {
    await expect(service.list(REP, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forbids a sales rep from listing another rep's quotation recommendations", async () => {
    await expect(service.list(OTHER_REP, "quote-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("RecommendationService.addToQuote", () => {
  beforeEach(() => {
    repository.recommendationById.set("rec-1", {
      id: "rec-1",
      quotationId: "quote-1",
      productId: "prod-candidate",
      status: "PENDING",
      salesRepId: REP.id,
      productIsSubscription: false,
    });
  });

  it("delegates the mutation to QuotationService.addLine and marks the recommendation ADDED", async () => {
    addLineMock.mockResolvedValue({
      lines: [{ id: "line-existing", product: { id: "prod-anchor" } }, { id: "line-new", product: { id: "prod-candidate" } }],
    });

    const result = await service.addToQuote(REP, "rec-1", { expectedVersion: 3 });

    expect(addLineMock).toHaveBeenCalledWith(REP, "quote-1", {
      expectedVersion: 3,
      productId: "prod-candidate",
      variantId: null,
      quantity: 1,
      billingType: "ONE_TIME",
    });
    expect(repository.markAddedCalls).toEqual([{ id: "rec-1", lineId: "line-new" }]);
    expect(result.quotationId).toBe("quote-1");
  });

  it("uses RECURRING billing for a subscription product", async () => {
    repository.recommendationById.set("rec-1", {
      id: "rec-1",
      quotationId: "quote-1",
      productId: "prod-candidate",
      status: "PENDING",
      salesRepId: REP.id,
      productIsSubscription: true,
    });
    addLineMock.mockResolvedValue({ lines: [{ id: "line-new", product: { id: "prod-candidate" } }] });

    await service.addToQuote(REP, "rec-1", { expectedVersion: 1 });

    expect(addLineMock).toHaveBeenCalledWith(REP, "quote-1", expect.objectContaining({ billingType: "RECURRING" }));
  });

  it("rejects adding a recommendation that isn't PENDING", async () => {
    repository.recommendationById.set("rec-1", {
      id: "rec-1",
      quotationId: "quote-1",
      productId: "prod-candidate",
      status: "ADDED",
      salesRepId: REP.id,
      productIsSubscription: false,
    });
    await expect(service.addToQuote(REP, "rec-1", { expectedVersion: 1 })).rejects.toMatchObject({
      code: "ALREADY_ACTIONED",
    });
    expect(addLineMock).not.toHaveBeenCalled();
  });

  it("forbids a sales rep from adding another rep's recommendation", async () => {
    await expect(service.addToQuote(OTHER_REP, "rec-1", { expectedVersion: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws NOT_FOUND for an unknown recommendation", async () => {
    await expect(service.addToQuote(REP, "missing", { expectedVersion: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("propagates a version conflict from QuotationService.addLine unchanged", async () => {
    addLineMock.mockRejectedValue(new ServiceError("VERSION_CONFLICT", "stale version"));
    await expect(service.addToQuote(REP, "rec-1", { expectedVersion: 1 })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(repository.markAddedCalls).toHaveLength(0);
  });
});

describe("RecommendationService.dismiss", () => {
  beforeEach(() => {
    repository.recommendationById.set("rec-1", {
      id: "rec-1",
      quotationId: "quote-1",
      productId: "prod-candidate",
      status: "PENDING",
      salesRepId: REP.id,
      productIsSubscription: false,
    });
  });

  it("marks the recommendation DISMISSED by the acting rep", async () => {
    await service.dismiss(REP, "rec-1");
    expect(repository.markDismissedCalls).toEqual([{ id: "rec-1", userId: REP.id }]);
  });

  it("rejects dismissing a recommendation that isn't PENDING", async () => {
    repository.recommendationById.set("rec-1", {
      id: "rec-1",
      quotationId: "quote-1",
      productId: "prod-candidate",
      status: "DISMISSED",
      salesRepId: REP.id,
      productIsSubscription: false,
    });
    await expect(service.dismiss(REP, "rec-1")).rejects.toMatchObject({ code: "ALREADY_ACTIONED" });
  });

  it("forbids a sales rep from dismissing another rep's recommendation", async () => {
    await expect(service.dismiss(OTHER_REP, "rec-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forbids a manager from dismissing (write access is Sales Rep only, matching QuotationService)", async () => {
    await expect(service.dismiss(MANAGER, "rec-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
