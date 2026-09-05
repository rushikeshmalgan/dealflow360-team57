import { describe, expect, it } from "vitest";
import { calculateProration } from "../proration";

describe("calculateProration (T10.2 Proration Engine)", () => {
  it("calculates upgrade adjustment mid-cycle (e.g. 10 days into a 30-day cycle)", () => {
    const currentStartDate = new Date("2026-09-01T00:00:00.000Z");
    const currentEndDate = new Date("2026-10-01T00:00:00.000Z"); // 30 days
    const effectiveDate = new Date("2026-09-11T00:00:00.000Z"); // 10 days elapsed, 20 days remaining

    // Old plan was $300 ($10/day). New plan is $600 ($20/day).
    const result = calculateProration({
      currentStartDate,
      currentEndDate,
      currentAmount: 300,
      effectiveDate,
      newAmount: 600,
    });

    expect(result.strategy).toBe("DAY_BASED");
    expect(result.totalCycleDays).toBe(30);
    expect(result.daysElapsed).toBe(10);
    expect(result.daysRemaining).toBe(20);
    expect(result.usedAmount).toBe(100); // 10 days * $10
    expect(result.unusedCredit).toBe(200); // 20 days * $10
    expect(result.newProratedCharge).toBe(400); // 20 days * $20
    expect(result.netAdjustment).toBe(200); // $400 - $200 = $200 additional charge
    expect(result.isUpgrade).toBe(true);
    expect(result.explanation).toContain("Day-based proration (DAY_BASED)");
  });

  it("calculates downgrade credit mid-cycle (e.g. 15 days into a 30-day cycle)", () => {
    const currentStartDate = new Date("2026-09-01T00:00:00.000Z");
    const currentEndDate = new Date("2026-10-01T00:00:00.000Z"); // 30 days
    const effectiveDate = new Date("2026-09-16T00:00:00.000Z"); // 15 days elapsed, 15 days remaining

    // Old plan was $600 ($20/day). New plan is $300 ($10/day).
    const result = calculateProration({
      currentStartDate,
      currentEndDate,
      currentAmount: 600,
      effectiveDate,
      newAmount: 300,
    });

    expect(result.totalCycleDays).toBe(30);
    expect(result.daysElapsed).toBe(15);
    expect(result.daysRemaining).toBe(15);
    expect(result.usedAmount).toBe(300);
    expect(result.unusedCredit).toBe(300);
    expect(result.newProratedCharge).toBe(150);
    expect(result.netAdjustment).toBe(-150); // customer gets $150 credit
    expect(result.isUpgrade).toBe(false);
  });

  it("handles effective date at start of cycle (0 days elapsed)", () => {
    const currentStartDate = new Date("2026-09-01T00:00:00.000Z");
    const currentEndDate = new Date("2026-10-01T00:00:00.000Z");
    const effectiveDate = new Date("2026-09-01T00:00:00.000Z");

    const result = calculateProration({
      currentStartDate,
      currentEndDate,
      currentAmount: 100,
      effectiveDate,
      newAmount: 200,
    });

    expect(result.daysElapsed).toBe(0);
    expect(result.daysRemaining).toBe(30);
    expect(result.usedAmount).toBe(0);
    expect(result.unusedCredit).toBe(100);
    expect(result.newProratedCharge).toBe(200);
    expect(result.netAdjustment).toBe(100);
  });

  it("handles effective date at end of cycle (full cycle elapsed)", () => {
    const currentStartDate = new Date("2026-09-01T00:00:00.000Z");
    const currentEndDate = new Date("2026-10-01T00:00:00.000Z");
    const effectiveDate = new Date("2026-10-01T00:00:00.000Z");

    const result = calculateProration({
      currentStartDate,
      currentEndDate,
      currentAmount: 100,
      effectiveDate,
      newAmount: 200,
    });

    expect(result.daysElapsed).toBe(30);
    expect(result.daysRemaining).toBe(0);
    expect(result.unusedCredit).toBe(0);
    expect(result.newProratedCharge).toBe(0);
    expect(result.netAdjustment).toBe(0);
  });
});
