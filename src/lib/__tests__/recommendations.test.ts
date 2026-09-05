import { describe, expect, it } from "vitest";

import {
  fetchMockRecommendations,
  mapRecommendationToViewModel,
  sortRecommendationsByRank,
  type RecommendationDto,
} from "@/lib/recommendations";

const dto: RecommendationDto = {
  id: "rec-1",
  quotationId: "quote-1",
  type: "UPSELL",
  rank: 2,
  score: 0.5,
  product: { id: "prod-1", name: "Widget Pro", sku: "WID-01", price: "199.99" },
  reasonCodes: ["HIGHER_TIER"],
  reason: "Higher-tier widget.",
  promotion: { id: "promo-1", name: "Spring Sale", discountPct: "12.50" },
  marginImpact: { deltaAmount: "40.00", deltaPct: "1.5", resultingMarginPct: "30.0" },
};

describe("mapRecommendationToViewModel", () => {
  it("converts Decimal-as-string wire fields to numbers", () => {
    const vm = mapRecommendationToViewModel(dto);
    expect(vm.price).toBe(199.99);
    expect(vm.promotion).toEqual({ name: "Spring Sale", discountPct: 12.5 });
    expect(vm.marginImpact).toEqual({ deltaAmount: 40, deltaPct: 1.5, resultingMarginPct: 30 });
  });

  it("maps a null promotion through as null", () => {
    const vm = mapRecommendationToViewModel({ ...dto, promotion: null });
    expect(vm.promotion).toBeNull();
  });
});

describe("sortRecommendationsByRank", () => {
  it("orders ascending by rank without mutating the input", () => {
    const a = mapRecommendationToViewModel({ ...dto, id: "a", rank: 3 });
    const b = mapRecommendationToViewModel({ ...dto, id: "b", rank: 1 });
    const c = mapRecommendationToViewModel({ ...dto, id: "c", rank: 2 });
    const input = [a, b, c];

    const sorted = sortRecommendationsByRank(input);

    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("fetchMockRecommendations", () => {
  it("returns a ranked mix of both recommendation types tagged with the given quotationId", async () => {
    const result = await fetchMockRecommendations("quote-42");

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.quotationId === "quote-42")).toBe(true);
    expect(result.some((r) => r.type === "UPSELL")).toBe(true);
    expect(result.some((r) => r.type === "CROSS_SELL")).toBe(true);

    const ranks = result.map((r) => r.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});
