import { describe, expect, it } from "vitest";

import {
  calculateLineMargin,
  calculateQuotationMargin,
  combineDiscounts,
} from "../calculate-discount-margin";

describe("combineDiscounts", () => {
  it("returns the line discount alone when there is no order discount", () => {
    expect(combineDiscounts({ lineDiscountPct: 12, orderDiscountPct: 0 })).toBeCloseTo(12);
  });

  it("returns the order discount alone when there is no line discount", () => {
    expect(combineDiscounts({ lineDiscountPct: 0, orderDiscountPct: 10 })).toBeCloseTo(10);
  });

  it("combines sequentially rather than additively (TAD SS10)", () => {
    // 1 - (1-0.12)*(1-0.10) = 1 - 0.792 = 0.208 -> 20.8%, not 22%.
    expect(combineDiscounts({ lineDiscountPct: 12, orderDiscountPct: 10 })).toBeCloseTo(20.8);
  });

  it("caps at 100% when combined discounts are total", () => {
    expect(combineDiscounts({ lineDiscountPct: 100, orderDiscountPct: 50 })).toBeCloseTo(100);
  });
});

describe("calculateLineMargin", () => {
  it("computes net revenue, cost, and margin for a discounted line", () => {
    // Gold example (TAD SS10): Laptop at 12% effective discount, no order discount.
    const result = calculateLineMargin({
      unitPrice: 1000,
      quantity: 2,
      unitCost: 700,
      lineDiscountPct: 12,
      orderDiscountPct: 0,
    });
    expect(result.effectiveDiscountPct).toBeCloseTo(12);
    expect(result.netBeforeTax).toBeCloseTo(1760); // 2000 * 0.88
    expect(result.costTotal).toBeCloseTo(1400);
    expect(result.marginAmount).toBeCloseTo(360);
    expect(result.marginPct).toBeCloseTo((360 / 1760) * 100);
  });

  it("returns null margin percentage when the line nets to zero revenue", () => {
    const result = calculateLineMargin({
      unitPrice: 500,
      quantity: 1,
      unitCost: 100,
      lineDiscountPct: 100,
      orderDiscountPct: 0,
    });
    expect(result.netBeforeTax).toBe(0);
    expect(result.marginPct).toBeNull();
  });
});

describe("calculateQuotationMargin", () => {
  it("aggregates net revenue, cost, and margin across lines", () => {
    // Gold example (TAD SS10): Laptop (12%/15% allowed, no violation) + Setup Service (18%/10% allowed, flagged).
    const laptop = calculateLineMargin({
      unitPrice: 1000,
      quantity: 1,
      unitCost: 700,
      lineDiscountPct: 12,
      orderDiscountPct: 0,
    });
    const setupService = calculateLineMargin({
      unitPrice: 200,
      quantity: 1,
      unitCost: 50,
      lineDiscountPct: 18,
      orderDiscountPct: 0,
    });

    const totals = calculateQuotationMargin([laptop, setupService]);

    expect(totals.totalNetBeforeTax).toBeCloseTo(laptop.netBeforeTax + setupService.netBeforeTax);
    expect(totals.totalCost).toBeCloseTo(750);
    expect(totals.marginPct).toBeCloseTo(
      (totals.totalMarginAmount / totals.totalNetBeforeTax) * 100,
    );
  });

  it("returns null margin percentage for an empty quotation", () => {
    expect(calculateQuotationMargin([]).marginPct).toBeNull();
  });
});
