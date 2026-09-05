import type { DealHealthConfig } from "../config";
import type { RuleFinding } from "../types";

export type DiscountAnomalyInput = {
  /** This quotation's current effective discount, value-weighted across lines (0-100). */
  currentDiscountPct: number;
  /** The sales rep's other quotations' effective discounts (0-100 each), most-recent-first,
   * already bounded to config.lookbackCount by the caller. */
  historicalDiscountPcts: readonly number[];
};

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: readonly number[], avg: number): number {
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * TAD SS34: current effective discount exceeds the rep's historical mean by a configured
 * percentage-point threshold OR a standard-deviation multiplier. "If history is too small, do
 * not alert" - returns null (not a zero-severity finding) below `minHistoricalSamples`, exactly
 * as required: insufficient data is a reason to stay silent, never a reason to warn.
 */
export function evaluateDiscountAnomaly(
  input: DiscountAnomalyInput,
  config: DealHealthConfig["discountAnomaly"],
): RuleFinding | null {
  const sampleSize = input.historicalDiscountPcts.length;
  if (sampleSize < config.minHistoricalSamples) return null;

  const baselineMeanPct = mean(input.historicalDiscountPcts);
  const baselineStdDevPct = stdDev(input.historicalDiscountPcts, baselineMeanPct);
  const deltaPct = input.currentDiscountPct - baselineMeanPct;

  const exceedsPercentagePoints = deltaPct > config.percentagePointThreshold;
  const exceedsStdDev = baselineStdDevPct > 0 && deltaPct > baselineStdDevPct * config.stdDevMultiplier;
  if (!exceedsPercentagePoints && !exceedsStdDev) return null;

  // How far past whichever threshold was crossed, for severity banding - the larger of the two
  // ratios, so a deal that blows past both measures is scored at least as severe as either alone.
  const pctRatio = deltaPct / config.percentagePointThreshold;
  const stdDevRatio = baselineStdDevPct > 0 ? deltaPct / (baselineStdDevPct * config.stdDevMultiplier) : 0;
  const ratio = Math.max(pctRatio, stdDevRatio);
  const severity = ratio >= 2.5 ? "CRITICAL" : ratio >= 1.5 ? "HIGH" : "MEDIUM";

  return {
    severity,
    details: {
      baselineMeanPct: Math.round(baselineMeanPct * 100) / 100,
      baselineStdDevPct: Math.round(baselineStdDevPct * 100) / 100,
      currentDiscountPct: Math.round(input.currentDiscountPct * 100) / 100,
      deltaPct: Math.round(deltaPct * 100) / 100,
      sampleSize,
      lookbackCount: config.lookbackCount,
      percentagePointThreshold: config.percentagePointThreshold,
      stdDevMultiplier: config.stdDevMultiplier,
    },
  };
}
