import { describe, expect, it } from "vitest";

import { DEAL_HEALTH_CONFIG_V1 } from "../config";
import { evaluateDiscountAnomaly } from "../rules/discount-anomaly";

// minHistoricalSamples: 5, percentagePointThreshold: 10, stdDevMultiplier: 2
const config = DEAL_HEALTH_CONFIG_V1.discountAnomaly;

describe("evaluateDiscountAnomaly", () => {
  it("does not create an alert when historical data is insufficient", () => {
    const finding = evaluateDiscountAnomaly(
      { currentDiscountPct: 40, historicalDiscountPcts: [10, 10, 10, 10] }, // 4 < minHistoricalSamples (5)
      config,
    );
    expect(finding).toBeNull();
  });

  it("does not fire when current discount is in line with history", () => {
    const finding = evaluateDiscountAnomaly(
      { currentDiscountPct: 12, historicalDiscountPcts: [10, 11, 9, 10, 12, 11] },
      config,
    );
    expect(finding).toBeNull();
  });

  it("fires when current discount exceeds the mean by more than the percentage-point threshold", () => {
    // mean = 10, current = 22 -> delta 12pp > 10pp threshold
    const finding = evaluateDiscountAnomaly(
      { currentDiscountPct: 22, historicalDiscountPcts: [10, 10, 10, 10, 10] },
      config,
    );
    expect(finding).not.toBeNull();
    expect(finding?.details).toMatchObject({ baselineMeanPct: 10, currentDiscountPct: 22, deltaPct: 12, sampleSize: 5 });
  });

  it("fires when current discount exceeds the mean by the standard-deviation multiplier even under the pp threshold", () => {
    // Tight historical cluster (small stdDev) so a modest-looking delta is still a big z-score.
    const historical = [10, 10.5, 9.5, 10, 10.5]; // mean=10.1, stdDev ~ 0.37
    const finding = evaluateDiscountAnomaly({ currentDiscountPct: 11.5, historicalDiscountPcts: historical }, config);
    expect(finding).not.toBeNull();
  });

  it("escalates severity with how far past the threshold the delta is", () => {
    const low = evaluateDiscountAnomaly({ currentDiscountPct: 21, historicalDiscountPcts: [10, 10, 10, 10, 10] }, config); // delta 11, ratio 1.1
    const high = evaluateDiscountAnomaly({ currentDiscountPct: 26, historicalDiscountPcts: [10, 10, 10, 10, 10] }, config); // delta 16, ratio 1.6
    const critical = evaluateDiscountAnomaly({ currentDiscountPct: 36, historicalDiscountPcts: [10, 10, 10, 10, 10] }, config); // delta 26, ratio 2.6

    expect(low?.severity).toBe("MEDIUM");
    expect(high?.severity).toBe("HIGH");
    expect(critical?.severity).toBe("CRITICAL");
  });
});
