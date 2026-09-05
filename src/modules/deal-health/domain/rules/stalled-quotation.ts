import type { DealHealthConfig } from "../config";
import type { RuleFinding } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Terminal states: the deal is done (won and fully closed, or lost) - no more activity is ever
 * expected, so staleness is meaningless. Every other QuotationStatus (including CONFIRMED/
 * FULFILLMENT/BILLING) still represents an active, in-flight deal for this indicator's purpose.
 */
const TERMINAL_STATUSES = new Set(["REJECTED", "COMPLETED"]);

export type StalledQuotationInput = {
  status: string;
  /** Proxy for TAD SS34's `last_business_activity_at`: quotations.updated_at, which Prisma's
   * `@updatedAt` bumps on every mutation to the row - no schema/column exists specifically for
   * this concept, and none of the write paths that would need to set it needed touching. */
  lastActivityAt: Date;
  now: Date;
};

/** TAD SS34: `now - last_business_activity_at > stalledDays` while the quote is active. */
export function evaluateStalledQuotation(
  input: StalledQuotationInput,
  config: DealHealthConfig["stalled"],
): RuleFinding | null {
  if (TERMINAL_STATUSES.has(input.status)) return null;

  const inactivityDays = (input.now.getTime() - input.lastActivityAt.getTime()) / DAY_MS;
  if (inactivityDays <= config.stalledDays) return null;

  const severity = inactivityDays >= config.stalledDays * config.criticalMultiplier ? "CRITICAL" : "HIGH";

  return {
    severity,
    details: {
      thresholdDays: config.stalledDays,
      inactivityDays: Math.round(inactivityDays * 100) / 100,
      lastActivityAt: input.lastActivityAt.toISOString(),
    },
  };
}
