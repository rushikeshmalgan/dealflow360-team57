import type { DealHealthConfig } from "./config";
import type { DealHealthSeverity } from "./types";

export type PriorityScoreInput = {
  severity: DealHealthSeverity;
  /** Deal (quotation) net value, currency units. */
  dealValue: number;
  ageDays: number;
};

/**
 * Deterministic 0-100 priority score from severity + deal value + age (TAD SS34: "Use a priority
 * score based on severity, value, and age for display" - explicitly not a model/prediction).
 * Severity sets the base tier; value and age each add a small, capped bonus so two alerts of the
 * same severity still rank sensibly (a bigger, older deal sorts above a smaller, newer one).
 */
export function computePriorityScore(
  input: PriorityScoreInput,
  config: DealHealthConfig["priorityScore"],
): number {
  const base = config.severityBase[input.severity];
  const valueComponent = Math.min(config.valueCap, Math.floor(Math.max(0, input.dealValue) / config.valueUnit));
  const ageComponent = Math.min(config.ageCap, Math.floor(Math.max(0, input.ageDays) / config.ageUnit));
  return Math.min(100, base + valueComponent + ageComponent);
}
