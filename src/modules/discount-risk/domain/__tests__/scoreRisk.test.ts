import { describe, expect, it } from "vitest";

import { calculateLineMargin } from "../calculate-discount-margin";
import { RISK_CONFIG_V1, scoreRisk } from "../scoreRisk";

/**
 * TAD SS10's required fixture: "Gold example: Laptop at 12% against 15% has zero excess.
 * Setup Service at 18% against 10% has 8 percentage points excess, so the quotation is
 * flagged." Feature-ticket-list T7.1 calls this out as the required unit-test fixture.
 */
function goldFixture() {
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
    unitCost: 100,
    lineDiscountPct: 18,
    orderDiscountPct: 0,
  });

  return {
    lines: [
      {
        lineId: "laptop",
        allowedDiscountPct: 15,
        effectiveDiscountPct: laptop.effectiveDiscountPct,
        netBeforeTax: laptop.netBeforeTax,
      },
      {
        lineId: "setup-service",
        allowedDiscountPct: 10,
        effectiveDiscountPct: setupService.effectiveDiscountPct,
        netBeforeTax: setupService.netBeforeTax,
      },
    ],
    quoteMarginPct: 40, // comfortably above the default configuredMinMarginPct so marginPressure is 0
  };
}

describe("scoreRisk — TAD SS10 Gold fixture", () => {
  it("finds zero excess on the compliant Laptop line and 8pp excess on the violating Setup Service line", () => {
    const result = scoreRisk(goldFixture());
    const laptop = result.explanation.lines.find((line) => line.lineId === "laptop")!;
    const service = result.explanation.lines.find((line) => line.lineId === "setup-service")!;

    expect(laptop.excessPct).toBeCloseTo(0);
    expect(service.excessPct).toBeCloseTo(8);
  });

  it("flags the quotation (forces at least MEDIUM) even though the blended score itself is low", () => {
    const result = scoreRisk(goldFixture());

    // A single 8pp violation on ~16% of quote value keeps the raw blended score well under the
    // MEDIUM threshold — the override is what actually flags it, exactly as TAD SS10 requires.
    expect(result.score).toBeLessThan(RISK_CONFIG_V1.bandThresholds.medium);
    expect(result.band).toBe("MEDIUM");
  });

  it("reports maxExcess as the single worst line's excess", () => {
    const result = scoreRisk(goldFixture());
    expect(result.explanation.maxExcess).toBeCloseTo(8);
  });

  it("weights violationBreadth by the violating line's share of quote value, not by line count", () => {
    const result = scoreRisk(goldFixture());
    // setup-service is ~164/1044 of quote net value.
    expect(result.explanation.violationBreadth).toBeCloseTo(164 / 1044, 2);
  });
});

describe("scoreRisk — LOW band", () => {
  it("returns LOW with a zero score when no line exceeds its ceiling and margin is healthy", () => {
    const laptop = calculateLineMargin({
      unitPrice: 1000,
      quantity: 1,
      unitCost: 700,
      lineDiscountPct: 10,
      orderDiscountPct: 0,
    });
    const result = scoreRisk({
      lines: [
        {
          lineId: "laptop",
          allowedDiscountPct: 15,
          effectiveDiscountPct: laptop.effectiveDiscountPct,
          netBeforeTax: laptop.netBeforeTax,
        },
      ],
      quoteMarginPct: 40,
    });
    expect(result.score).toBe(0);
    expect(result.band).toBe("LOW");
  });

  it("treats a null ceiling (no discount rule configured) as never violating", () => {
    const laptop = calculateLineMargin({
      unitPrice: 1000,
      quantity: 1,
      unitCost: 700,
      lineDiscountPct: 50,
      orderDiscountPct: 0,
    });
    const result = scoreRisk({
      lines: [
        {
          lineId: "laptop",
          allowedDiscountPct: null,
          effectiveDiscountPct: laptop.effectiveDiscountPct,
          netBeforeTax: laptop.netBeforeTax,
        },
      ],
      quoteMarginPct: 40,
    });
    expect(result.band).toBe("LOW");
  });
});

describe("scoreRisk — margin pressure", () => {
  it("pushes the score up when quote margin falls below the configured minimum, with no discount violations", () => {
    const laptop = calculateLineMargin({
      unitPrice: 1000,
      quantity: 1,
      unitCost: 700,
      lineDiscountPct: 5,
      orderDiscountPct: 0,
    });
    const healthy = scoreRisk({
      lines: [
        {
          lineId: "laptop",
          allowedDiscountPct: 15,
          effectiveDiscountPct: laptop.effectiveDiscountPct,
          netBeforeTax: laptop.netBeforeTax,
        },
      ],
      quoteMarginPct: 40,
    });
    const belowFloor = scoreRisk({
      lines: [
        {
          lineId: "laptop",
          allowedDiscountPct: 15,
          effectiveDiscountPct: laptop.effectiveDiscountPct,
          netBeforeTax: laptop.netBeforeTax,
        },
      ],
      quoteMarginPct: 5, // below configuredMinMarginPct: 20
    });

    expect(healthy.explanation.marginPressure).toBe(0);
    expect(belowFloor.explanation.marginPressure).toBeGreaterThan(0);
    expect(belowFloor.score).toBeGreaterThan(healthy.score);
  });

  it("treats a null quote margin (no revenue) as zero pressure rather than throwing", () => {
    const result = scoreRisk({ lines: [], quoteMarginPct: null });
    expect(result.explanation.marginPressure).toBe(0);
    expect(result.band).toBe("LOW");
  });
});
