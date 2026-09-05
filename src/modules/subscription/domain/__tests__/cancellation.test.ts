import { describe, expect, it } from "vitest";
import { calculateCancellationRefund } from "../cancellation";

describe("calculateCancellationRefund (T10.3 Cancellation & Refund Trigger)", () => {
  it("calculates immediate cancellation pro-rata refund and credit note flag", () => {
    const currentStartDate = new Date("2026-09-01T00:00:00.000Z");
    const currentEndDate = new Date("2026-10-01T00:00:00.000Z"); // 30 days
    const cancelDate = new Date("2026-09-11T00:00:00.000Z"); // 10 days used, 20 days remaining

    const result = calculateCancellationRefund({
      currentStartDate,
      currentEndDate,
      currentAmount: 300,
      cancelDate,
      immediate: true,
    });

    expect(result.immediate).toBe(true);
    expect(result.policy).toBe("IMMEDIATE");
    expect(result.refundEligible).toBe(true);
    expect(result.creditNoteRequired).toBe(true);
    expect(result.daysRemaining).toBe(20);
    expect(result.refundAmount).toBe(200); // 20/30 * 300
    expect(result.explanation).toContain("Pro-rata refund of $200.00");
    expect(result.explanation).toContain("Credit note generated");
  });

  it("handles end-of-cycle cancellation policy without immediate refund", () => {
    const currentStartDate = new Date("2026-09-01T00:00:00.000Z");
    const currentEndDate = new Date("2026-10-01T00:00:00.000Z");
    const cancelDate = new Date("2026-09-11T00:00:00.000Z");

    const result = calculateCancellationRefund({
      currentStartDate,
      currentEndDate,
      currentAmount: 300,
      cancelDate,
      immediate: false,
    });

    expect(result.immediate).toBe(false);
    expect(result.refundEligible).toBe(false);
    expect(result.creditNoteRequired).toBe(false);
    expect(result.refundAmount).toBe(0);
    expect(result.daysRemaining).toBe(0);
    expect(result.explanation).toContain("Subscription scheduled to cancel at end of billing cycle");
  });

  it("does not generate refund if remaining days is below minimumDaysForRefund", () => {
    const currentStartDate = new Date("2026-09-01T00:00:00.000Z");
    const currentEndDate = new Date("2026-10-01T00:00:00.000Z");
    const cancelDate = new Date("2026-09-30T12:00:00.000Z"); // 0 days remaining (same day as end)

    const result = calculateCancellationRefund({
      currentStartDate,
      currentEndDate,
      currentAmount: 300,
      cancelDate,
      immediate: true,
      partialRefundRule: {
        minimumDaysForRefund: 1,
      },
    });

    expect(result.refundEligible).toBe(false);
    expect(result.creditNoteRequired).toBe(false);
    expect(result.refundAmount).toBe(0);
  });
});
