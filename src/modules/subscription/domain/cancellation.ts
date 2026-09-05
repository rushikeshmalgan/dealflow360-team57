import {
  DEFAULT_CANCELLATION_RULE,
  DEFAULT_PARTIAL_REFUND_RULE,
  calculateDaysBetween,
} from "./cadence";

export interface CancellationInput {
  currentStartDate: Date;
  currentEndDate: Date;
  currentAmount: number;
  cancelDate: Date;
  immediate?: boolean;
  cancellationRule?: {
    policy?: string;
    allowImmediate?: boolean;
    refundEligible?: boolean;
  };
  partialRefundRule?: {
    strategy?: string;
    creditNoteOnCancel?: boolean;
    minimumDaysForRefund?: number;
  };
}

export interface CancellationResult {
  effectiveCancellationDate: Date;
  immediate: boolean;
  policy: string;
  refundEligible: boolean;
  creditNoteRequired: boolean;
  totalCycleDays: number;
  daysUsed: number;
  daysRemaining: number;
  refundAmount: number;
  explanation: string;
}

/**
 * Evaluates subscription cancellation and computes refund/credit note triggers (T10.3, WF35-WF36).
 * Adheres to labeled configuration for cancellation and partial-refund rules (TAD §25).
 */
export function calculateCancellationRefund(input: CancellationInput): CancellationResult {
  const cancelRule = input.cancellationRule ?? DEFAULT_CANCELLATION_RULE;
  const refundRule = input.partialRefundRule ?? DEFAULT_PARTIAL_REFUND_RULE;

  const allowImmediate = cancelRule.allowImmediate ?? true;
  const isImmediate = (input.immediate ?? true) && allowImmediate;
  const policy = isImmediate ? "IMMEDIATE" : (cancelRule.policy ?? "END_OF_CYCLE");

  const totalCycleDays = Math.max(1, calculateDaysBetween(input.currentStartDate, input.currentEndDate));

  if (!isImmediate) {
    return {
      effectiveCancellationDate: input.currentEndDate,
      immediate: false,
      policy,
      refundEligible: false,
      creditNoteRequired: false,
      totalCycleDays,
      daysUsed: totalCycleDays,
      daysRemaining: 0,
      refundAmount: 0,
      explanation: `Subscription scheduled to cancel at end of billing cycle (${input.currentEndDate.toISOString()}). No mid-cycle refund applicable.`,
    };
  }

  // Immediate cancellation: calculate pro-rata unused days
  const cancelMs = Math.min(
    input.currentEndDate.getTime(),
    Math.max(input.currentStartDate.getTime(), input.cancelDate.getTime()),
  );
  const clampedCancelDate = new Date(cancelMs);

  const daysUsed = Math.min(
    totalCycleDays,
    Math.max(0, calculateDaysBetween(input.currentStartDate, clampedCancelDate)),
  );
  const daysRemaining = Math.max(0, totalCycleDays - daysUsed);

  const minimumDays = refundRule.minimumDaysForRefund ?? 1;
  const refundEligible = Boolean(cancelRule.refundEligible) && daysRemaining >= minimumDays;

  let refundAmount = 0;
  if (refundEligible && input.currentAmount > 0) {
    const dailyRate = input.currentAmount / totalCycleDays;
    refundAmount = Number((dailyRate * daysRemaining).toFixed(2));
  }

  const creditNoteRequired = refundEligible && Boolean(refundRule.creditNoteOnCancel) && refundAmount > 0;

  const explanation =
    `Immediate cancellation effective ${clampedCancelDate.toISOString()}. ` +
    `${daysRemaining} of ${totalCycleDays} days remaining in cycle. ` +
    (refundAmount > 0
      ? `Pro-rata refund of $${refundAmount.toFixed(2)} calculated under ${refundRule.strategy ?? "PRO_RATA_REFUND"} rule.` +
        (creditNoteRequired ? " Credit note generated." : "")
      : "No refund applicable.");

  return {
    effectiveCancellationDate: clampedCancelDate,
    immediate: true,
    policy,
    refundEligible,
    creditNoteRequired,
    totalCycleDays,
    daysUsed,
    daysRemaining,
    refundAmount,
    explanation,
  };
}
