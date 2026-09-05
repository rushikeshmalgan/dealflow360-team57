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
