import { describe, expect, it } from "vitest";

import { RECOMMENDATION_CONFIG_V1 } from "../config";
import { buildReasonCodes } from "../reason-codes";
import type { ScoreComponents } from "../score";

const zeroComponents: ScoreComponents = {
  coPurchase: 0,
  promotion: 0,
  margin: 0,
  compatibility: 1,
  availability: 0,
  tierAffinity: 0,
};
const zeroWeighted: ScoreComponents = { ...zeroComponents, compatibility: RECOMMENDATION_CONFIG_V1.weights.compatibility };

describe("buildReasonCodes", () => {
  it("always leads with the classification code", () => {
    const upsell = buildReasonCodes("UPSELL", zeroComponents, zeroWeighted, RECOMMENDATION_CONFIG_V1);
    expect(upsell.reasonCodes[0]).toBe("HIGHER_TIER");

    const crossSell = buildReasonCodes("CROSS_SELL", zeroComponents, zeroWeighted, RECOMMENDATION_CONFIG_V1);
    expect(crossSell.reasonCodes[0]).toBe("COMPLEMENTARY_PRODUCT");
  });

  it("includes no extra codes when every component is at or below the threshold", () => {
    const result = buildReasonCodes("CROSS_SELL", zeroComponents, zeroWeighted, RECOMMENDATION_CONFIG_V1);
    expect(result.reasonCodes).toEqual(["COMPLEMENTARY_PRODUCT"]);
  });

  it("includes a code once its component clears the threshold", () => {
    const components: ScoreComponents = { ...zeroComponents, coPurchase: 0.9 };
    const weighted: ScoreComponents = { ...zeroWeighted, coPurchase: RECOMMENDATION_CONFIG_V1.weights.coPurchase * 0.9 };
    const result = buildReasonCodes("CROSS_SELL", components, weighted, RECOMMENDATION_CONFIG_V1);
    expect(result.reasonCodes).toContain("FREQUENTLY_CO_PURCHASED");
  });

  it("orders qualifying codes by weighted contribution, most impactful first", () => {
    const components: ScoreComponents = { ...zeroComponents, coPurchase: 0.9, margin: 0.4 };
    const weighted: ScoreComponents = {
      ...zeroWeighted,
      coPurchase: RECOMMENDATION_CONFIG_V1.weights.coPurchase * 0.9, // 0.3 * 0.9 = 0.27
      margin: RECOMMENDATION_CONFIG_V1.weights.margin * 0.4, // 0.2 * 0.4 = 0.08
    };
    const result = buildReasonCodes("CROSS_SELL", components, weighted, RECOMMENDATION_CONFIG_V1);
    expect(result.reasonCodes).toEqual(["COMPLEMENTARY_PRODUCT", "FREQUENTLY_CO_PURCHASED", "HIGH_MARGIN"]);
  });

  it("builds a human-readable reason from the top codes' labels", () => {
    const components: ScoreComponents = { ...zeroComponents, promotion: 0.9 };
    const weighted: ScoreComponents = { ...zeroWeighted, promotion: RECOMMENDATION_CONFIG_V1.weights.promotion * 0.9 };
    const result = buildReasonCodes("UPSELL", components, weighted, RECOMMENDATION_CONFIG_V1);
    expect(result.reason).toContain("higher-tier product");
    expect(result.reason).toContain("active promotion applies");
  });
});
