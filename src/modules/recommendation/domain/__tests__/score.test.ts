import { describe, expect, it } from "vitest";

import { RECOMMENDATION_CONFIG_V1 } from "../config";
import { computeScoreComponents, scoreCandidate, type ScoreComponentsInput } from "../score";

function baseInput(overrides: Partial<ScoreComponentsInput> = {}): ScoreComponentsInput {
  return {
    coOccurrenceCount: 0,
    maxCoOccurrenceCount: 0,
    matchedPromotionMaxDiscountPct: null,
    marginPct: 0,
    availableQty: 0,
    tierAffinitySameTierCount: 0,
    tierAffinityTotalCount: 0,
    ...overrides,
  };
}

describe("computeScoreComponents", () => {
  it("returns all-zero components (except compatibility) for a candidate with no signal at all", () => {
    const components = computeScoreComponents(baseInput(), RECOMMENDATION_CONFIG_V1);
    expect(components).toEqual({
      coPurchase: 0,
      promotion: 0,
      margin: 0,
      compatibility: 1,
      availability: 0,
      tierAffinity: 0,
    });
  });

  it("normalizes coPurchase relative to the max co-occurrence count in the candidate set", () => {
    const components = computeScoreComponents(
      baseInput({ coOccurrenceCount: 5, maxCoOccurrenceCount: 10 }),
      RECOMMENDATION_CONFIG_V1,
    );
    expect(components.coPurchase).toBeCloseTo(0.5);
  });

  it("scores promotion as 0 with no matched promotion and scales with discount pct otherwise", () => {
    const none = computeScoreComponents(baseInput({ matchedPromotionMaxDiscountPct: null }), RECOMMENDATION_CONFIG_V1);
    expect(none.promotion).toBe(0);

    const withPromo = computeScoreComponents(
      baseInput({ matchedPromotionMaxDiscountPct: 25 }),
      RECOMMENDATION_CONFIG_V1,
    );
    expect(withPromo.promotion).toBeCloseTo(25 / RECOMMENDATION_CONFIG_V1.promotionDiscountNormalizationPct);
  });

  it("clamps margin at 1 once margin % meets or exceeds the normalization ceiling", () => {
    const components = computeScoreComponents(
      baseInput({ marginPct: RECOMMENDATION_CONFIG_V1.marginNormalizationCeilingPct * 2 }),
      RECOMMENDATION_CONFIG_V1,
    );
    expect(components.margin).toBe(1);
  });

  it("clamps availability at 1 once stock meets or exceeds the ceiling", () => {
    const components = computeScoreComponents(
      baseInput({ availableQty: RECOMMENDATION_CONFIG_V1.availabilityCeilingQty * 3 }),
      RECOMMENDATION_CONFIG_V1,
    );
    expect(components.availability).toBe(1);
  });

  it("computes tierAffinity as a same-tier ratio, 0 when there is no purchase history", () => {
    const noHistory = computeScoreComponents(baseInput(), RECOMMENDATION_CONFIG_V1);
    expect(noHistory.tierAffinity).toBe(0);

    const withHistory = computeScoreComponents(
      baseInput({ tierAffinitySameTierCount: 3, tierAffinityTotalCount: 4 }),
      RECOMMENDATION_CONFIG_V1,
    );
    expect(withHistory.tierAffinity).toBe(0.75);
  });
});

describe("scoreCandidate", () => {
  it("weights and sums components into a final score in [0,1], tagged with the config version", () => {
    const result = scoreCandidate(
      baseInput({
        coOccurrenceCount: 10,
        maxCoOccurrenceCount: 10,
        matchedPromotionMaxDiscountPct: 50,
        marginPct: 60,
        availableQty: 50,
        tierAffinitySameTierCount: 1,
        tierAffinityTotalCount: 1,
      }),
      RECOMMENDATION_CONFIG_V1,
    );

    // Every component maxed out (1.0) -> weighted sum equals the sum of all weights.
    const expectedScore = Object.values(RECOMMENDATION_CONFIG_V1.weights).reduce((a, b) => a + b, 0);
    expect(result.score).toBeCloseTo(expectedScore);
    expect(result.configVersion).toBe(RECOMMENDATION_CONFIG_V1.version);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("produces a higher score for a candidate with strictly better signals, all else equal", () => {
    const weak = scoreCandidate(baseInput({ marginPct: 10 }), RECOMMENDATION_CONFIG_V1);
    const strong = scoreCandidate(baseInput({ marginPct: 60 }), RECOMMENDATION_CONFIG_V1);
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("weightedComponents sum to the same total as `score`", () => {
    const result = scoreCandidate(
      baseInput({ coOccurrenceCount: 3, maxCoOccurrenceCount: 6, marginPct: 30, availableQty: 20 }),
      RECOMMENDATION_CONFIG_V1,
    );
    const sum = Object.values(result.weightedComponents).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(result.score);
  });
});
