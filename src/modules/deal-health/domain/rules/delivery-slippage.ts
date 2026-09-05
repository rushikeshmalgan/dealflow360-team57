import type { DealHealthConfig } from "../config";
import type { RuleFinding } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DeliverySlippageInput = {
  /** The delivery date committed to the customer. No dedicated "promised date" field exists yet
   * (see the application layer's snapshot query for how this is sourced from existing negotiation
   * data) - callers only invoke this rule once they actually have one. */
  promisedDate: Date;
  /** The fulfillment's current worst (latest) estimated ship date across its line items. */
  currentEstimateDate: Date;
};

/** TAD SS34: estimated ship/delivery date exceeds the promised date. */
export function evaluateDeliverySlippage(
  input: DeliverySlippageInput,
  config: DealHealthConfig["deliverySlippage"],
): RuleFinding | null {
  const daysLate = (input.currentEstimateDate.getTime() - input.promisedDate.getTime()) / DAY_MS;
  if (daysLate <= 0) return null;

  const severity = daysLate > config.criticalDays ? "CRITICAL" : daysLate > config.warningDays ? "HIGH" : "MEDIUM";

  return {
    severity,
    details: {
      promisedDate: input.promisedDate.toISOString(),
      currentEstimateDate: input.currentEstimateDate.toISOString(),
      daysLate: Math.round(daysLate * 100) / 100,
    },
  };
}
