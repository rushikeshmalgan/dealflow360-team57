import { describe, expect, it } from "vitest";

import { DEAL_HEALTH_CONFIG_V1 } from "../config";
import { evaluateStalledQuotation } from "../rules/stalled-quotation";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const config = DEAL_HEALTH_CONFIG_V1.stalled; // stalledDays: 14, criticalMultiplier: 2

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("evaluateStalledQuotation", () => {
  it("does not fire when inactivity is under the threshold", () => {
    expect(evaluateStalledQuotation({ status: "UNDER_NEGOTIATION", lastActivityAt: daysAgo(10), now: NOW }, config)).toBeNull();
  });

  it("does not fire exactly at the threshold (strictly greater-than)", () => {
    expect(evaluateStalledQuotation({ status: "DRAFT", lastActivityAt: daysAgo(14), now: NOW }, config)).toBeNull();
  });

  it("fires HIGH just past the threshold", () => {
    const finding = evaluateStalledQuotation({ status: "SUBMITTED", lastActivityAt: daysAgo(15), now: NOW }, config);
    expect(finding?.severity).toBe("HIGH");
    expect(finding?.details).toMatchObject({ thresholdDays: 14, inactivityDays: 15 });
  });

  it("escalates to CRITICAL at 2x the threshold", () => {
    const finding = evaluateStalledQuotation({ status: "PENDING_APPROVAL", lastActivityAt: daysAgo(28), now: NOW }, config);
    expect(finding?.severity).toBe("CRITICAL");
  });

  it("never fires for a REJECTED (terminal) quotation, however stale", () => {
    expect(evaluateStalledQuotation({ status: "REJECTED", lastActivityAt: daysAgo(365), now: NOW }, config)).toBeNull();
  });

  it("never fires for a COMPLETED (terminal) quotation, however stale", () => {
    expect(evaluateStalledQuotation({ status: "COMPLETED", lastActivityAt: daysAgo(365), now: NOW }, config)).toBeNull();
  });

  it("still fires for a post-sale active state (e.g. FULFILLMENT)", () => {
    expect(evaluateStalledQuotation({ status: "FULFILLMENT", lastActivityAt: daysAgo(20), now: NOW }, config)?.severity).toBe(
      "HIGH",
    );
  });
});
