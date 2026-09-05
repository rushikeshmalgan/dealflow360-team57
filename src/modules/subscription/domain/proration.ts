import { DEFAULT_PRORATION_RULE, calculateDaysBetween } from "./cadence";

export interface ProrationInput {
  currentStartDate: Date;
  currentEndDate: Date;
  currentAmount: number;
  effectiveDate: Date;
  newAmount: number;
  prorationRule?: {
    strategy?: string;
    description?: string;
    allowMidCycle?: boolean;
    precision?: string;
  };
}

export interface ProrationResult {
  strategy: string;
  totalCycleDays: number;
  daysElapsed: number;
  daysRemaining: number;
  currentAmount: number;
  usedAmount: number;
  unusedCredit: number;
  newAmount: number;
  newProratedCharge: number;
  netAdjustment: number;
  isUpgrade: boolean;
  explanation: string;
}

/**
 * Transparent day-based proration engine (TAD §25 / WF33-WF34).
 * Stored and labeled as configuration. Calculates unused credit from the current
 * plan and prorated charge for the remaining cycle duration.
 */
export function calculateProration(input: ProrationInput): ProrationResult {
  const rule = input.prorationRule ?? DEFAULT_PRORATION_RULE;
  const strategy = rule.strategy ?? "DAY_BASED";

  const totalCycleDays = Math.max(1, calculateDaysBetween(input.currentStartDate, input.currentEndDate));

  // Clamp effective date between cycle start and cycle end
  const effectiveMs = Math.min(
    input.currentEndDate.getTime(),
    Math.max(input.currentStartDate.getTime(), input.effectiveDate.getTime()),
  );
  const clampedEffectiveDate = new Date(effectiveMs);

  const daysElapsed = Math.min(
    totalCycleDays,
    Math.max(0, calculateDaysBetween(input.currentStartDate, clampedEffectiveDate)),
  );
  const daysRemaining = Math.max(0, totalCycleDays - daysElapsed);

  const currentDailyRate = input.currentAmount / totalCycleDays;
  const usedAmount = Number((currentDailyRate * daysElapsed).toFixed(2));
  const unusedCredit = Number((input.currentAmount - usedAmount).toFixed(2));

  const newDailyRate = input.newAmount / totalCycleDays;
  const newProratedCharge = Number((newDailyRate * daysRemaining).toFixed(2));
  const netAdjustment = Number((newProratedCharge - unusedCredit).toFixed(2));
  const isUpgrade = netAdjustment > 0;

  const explanation =
    `Day-based proration (${strategy}): ${daysElapsed} of ${totalCycleDays} days used ` +
    `($${usedAmount.toFixed(2)} consumed, $${unusedCredit.toFixed(2)} unused credit). ` +
    `${daysRemaining} days remaining at new rate ($${newProratedCharge.toFixed(2)}). ` +
    `Net adjustment: ${netAdjustment >= 0 ? "+" : ""}$${netAdjustment.toFixed(2)}.`;

  return {
    strategy,
    totalCycleDays,
    daysElapsed,
    daysRemaining,
    currentAmount: input.currentAmount,
    usedAmount,
    unusedCredit,
    newAmount: input.newAmount,
    newProratedCharge,
    netAdjustment,
    isUpgrade,
    explanation,
  };
}
