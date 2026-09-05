import { describe, expect, it } from "vitest";

import { estimateShipmentDate, estimateShippingCost } from "../estimate-shipping";

describe("estimateShippingCost", () => {
  it("scales with quantity and the warehouse's shipping cost weight", () => {
    expect(estimateShippingCost(5, 1)).toBe(50);
    expect(estimateShippingCost(5, 2)).toBe(100);
    expect(estimateShippingCost(0, 1)).toBe(0);
  });
});

describe("estimateShipmentDate", () => {
  it("adds the configured lead time in days", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const result = estimateShipmentDate(from);
    expect(result.toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });
});
