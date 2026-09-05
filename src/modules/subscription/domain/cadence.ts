export const SUBSCRIPTION_CADENCES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;

export type SubscriptionCadence = (typeof SUBSCRIPTION_CADENCES)[number];

export function isValidCadence(cadence: unknown): cadence is SubscriptionCadence {
  return typeof cadence === "string" && SUBSCRIPTION_CADENCES.includes(cadence as SubscriptionCadence);
}

/**
 * Transparent day-based proration rule (TAD §25 / §54).
 * Stored as labeled configuration, not hardcoded logic.
 */
export const DEFAULT_PRORATION_RULE = {
  strategy: "DAY_BASED",
  description: "Pro-rata billing based on elapsed days in the billing cycle",
  allowMidCycle: true,
  precision: "DAY",
} as const;

/**
 * Cancellation policy configuration (TAD §25 / §54).
 * Stored as labeled configuration.
 */
export const DEFAULT_CANCELLATION_RULE = {
  policy: "END_OF_CYCLE",
  allowImmediate: true,
  refundEligible: true,
  description: "Subscription can cancel immediately with refund or at end of current billing cycle",
} as const;

/**
 * Partial-refund rule configuration (TAD §25 / §54).
 * Stored as labeled configuration.
 */
export const DEFAULT_PARTIAL_REFUND_RULE = {
  strategy: "PRO_RATA_REFUND",
  creditNoteOnCancel: true,
  minimumDaysForRefund: 1,
  description: "Pro-rata credit note or refund calculated on unused subscription cycle duration",
} as const;

/**
 * Calculates cycle end date given a start date and cadence.
 * Cycle ends exactly at the start of the next cycle.
 */
export function calculateCycleEndDate(startDate: Date, cadence: SubscriptionCadence): Date {
  const end = new Date(startDate.getTime());
  switch (cadence) {
    case "MONTHLY":
      end.setUTCMonth(end.getUTCMonth() + 1);
      break;
    case "QUARTERLY":
      end.setUTCMonth(end.getUTCMonth() + 3);
      break;
    case "YEARLY":
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      break;
  }
  return end;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculates whole or fractional days between two dates.
 * Clamped to non-negative if end is after start.
 */
export function calculateDaysBetween(startDate: Date, endDate: Date): number {
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.round(diffMs / MS_PER_DAY));
}
