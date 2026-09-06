import { describe, expect, it } from "vitest";

import { RECOMMENDATION_CONFIG_V1 } from "../config";
import { findExclusionReason, type ExclusionCheckInput } from "../exclusions";
import type { Candidate } from "../types";

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    productId: "prod-1",
    name: "Widget",
    sku: "WID-1",
    categoryId: "cat-1",
    price: 100,
    costPrice: 50,
    isSubscription: false,
    isActive: true,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ExclusionCheckInput> = {}): ExclusionCheckInput {
  return {
    candidate: candidate(),
    marginPct: 50,
    availableQty: 10,
    alreadyInQuoteProductIds: new Set(),
    alreadyDecidedProductIds: new Set(),
    ...overrides,
  };
}

describe("findExclusionReason", () => {
  it("returns null for an eligible candidate", () => {
    expect(findExclusionReason(baseInput(), RECOMMENDATION_CONFIG_V1)).toBeNull();
  });

  it("excludes a product already in the quote", () => {
    const input = baseInput({ alreadyInQuoteProductIds: new Set(["prod-1"]) });
    expect(findExclusionReason(input, RECOMMENDATION_CONFIG_V1)).toBe("ALREADY_IN_QUOTE");
  });

  it("excludes an inactive product", () => {
    const input = baseInput({ candidate: candidate({ isActive: false }) });
    expect(findExclusionReason(input, RECOMMENDATION_CONFIG_V1)).toBe("INACTIVE_PRODUCT");
  });

  it("excludes a product already decided (added or dismissed) for this quotation", () => {
    const input = baseInput({ alreadyDecidedProductIds: new Set(["prod-1"]) });
    expect(findExclusionReason(input, RECOMMENDATION_CONFIG_V1)).toBe("ALREADY_DECIDED");
  });

  it("excludes an out-of-stock product", () => {
    const input = baseInput({ availableQty: 0 });
    expect(findExclusionReason(input, RECOMMENDATION_CONFIG_V1)).toBe("OUT_OF_STOCK");
  });

  it("excludes a candidate below the configured minimum margin", () => {
    const input = baseInput({ marginPct: RECOMMENDATION_CONFIG_V1.minMarginPct - 1 });
    expect(findExclusionReason(input, RECOMMENDATION_CONFIG_V1)).toBe("BELOW_MINIMUM_MARGIN");
  });

  it("excludes a candidate with a null margin (zero net revenue)", () => {
    const input = baseInput({ marginPct: null });
    expect(findExclusionReason(input, RECOMMENDATION_CONFIG_V1)).toBe("BELOW_MINIMUM_MARGIN");
  });

  it("checks already-in-quote before any other reason", () => {
    const input = baseInput({
      alreadyInQuoteProductIds: new Set(["prod-1"]),
      candidate: candidate({ isActive: false }),
      availableQty: 0,
      marginPct: 0,
    });
    expect(findExclusionReason(input, RECOMMENDATION_CONFIG_V1)).toBe("ALREADY_IN_QUOTE");
  });
});
