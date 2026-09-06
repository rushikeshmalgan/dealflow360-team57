import { describe, expect, it } from "vitest";

import { classifyRecommendation } from "../classify";
import { RECOMMENDATION_CONFIG_V1 } from "../config";
import type { AnchorLine, Candidate } from "../types";

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

const anchor: AnchorLine = { productId: "prod-anchor", categoryId: "cat-1", unitPrice: 100 };

describe("classifyRecommendation", () => {
  it("classifies a same-category, meaningfully pricier candidate as UPSELL", () => {
    const result = classifyRecommendation(candidate({ price: 120 }), [anchor], RECOMMENDATION_CONFIG_V1);
    expect(result).toBe("UPSELL");
  });

  it("classifies a same-category candidate at exactly the threshold ratio as UPSELL", () => {
    const price = anchor.unitPrice * RECOMMENDATION_CONFIG_V1.upsellPriceRatioThreshold;
    const result = classifyRecommendation(candidate({ price }), [anchor], RECOMMENDATION_CONFIG_V1);
    expect(result).toBe("UPSELL");
  });

  it("classifies a same-category candidate priced below the threshold as CROSS_SELL", () => {
    const result = classifyRecommendation(candidate({ price: 105 }), [anchor], RECOMMENDATION_CONFIG_V1);
    expect(result).toBe("CROSS_SELL");
  });

  it("classifies a different-category candidate as CROSS_SELL regardless of price", () => {
    const result = classifyRecommendation(
      candidate({ categoryId: "cat-2", price: 500 }),
      [anchor],
      RECOMMENDATION_CONFIG_V1,
    );
    expect(result).toBe("CROSS_SELL");
  });

  it("classifies as CROSS_SELL when there are no anchor lines at all", () => {
    const result = classifyRecommendation(candidate({ price: 999 }), [], RECOMMENDATION_CONFIG_V1);
    expect(result).toBe("CROSS_SELL");
  });
});
