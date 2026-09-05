import type { DealHealthSeverity } from "./types";

/**
 * Versioned deterministic configuration for all four TAD SS34 indicators, mirroring
 * discount-risk/domain/scoreRisk.ts's RISK_CONFIG_V1 pattern: bump `version` (and export a new
 * object) whenever a threshold changes, so a persisted alert's `details` stays explainable
 * against the config that produced it.
 */
export type DealHealthConfig = {
  version: number;
  batchSize: number;
  stalled: {
    /** `now - last_business_activity_at > stalledDays` (TAD SS34) while the quote is active. */
    stalledDays: number;
    /** Inactivity >= stalledDays * this multiplier escalates HIGH -> CRITICAL. */
    criticalMultiplier: number;
  };
  discountAnomaly: {
    /** Below this many historical data points, the rule never fires (TAD SS34: "too small -> no alert"). */
    minHistoricalSamples: number;
    /** How many of the rep's most recent other quotations form the baseline. */
    lookbackCount: number;
    /** Fires when current discount exceeds the rep's mean by this many percentage points. */
    percentagePointThreshold: number;
    /** ...or by this many standard deviations, whichever condition is met first. */
    stdDevMultiplier: number;
  };
  deliverySlippage: {
    /** daysLate beyond this (but at/below critical) is HIGH; at/below this is MEDIUM. */
    warningDays: number;
    /** daysLate beyond this is CRITICAL. */
    criticalDays: number;
  };
  highRiskDeal: {
    /** Finance approval PENDING longer than this is flagged, regardless of risk band. */
    pendingApprovalAgeHours: number;
  };
  priorityScore: {
    severityBase: Record<DealHealthSeverity, number>;
    /** +1 point per this many currency units of deal value, capped at valueCap. */
    valueUnit: number;
    valueCap: number;
    /** +1 point per this many days of deal age, capped at ageCap. */
    ageUnit: number;
    ageCap: number;
  };
};

export const DEAL_HEALTH_CONFIG_V1: DealHealthConfig = {
  version: 1,
  batchSize: 50,
  stalled: { stalledDays: 14, criticalMultiplier: 2 },
  discountAnomaly: {
    minHistoricalSamples: 5,
    lookbackCount: 20,
    percentagePointThreshold: 10,
    stdDevMultiplier: 2,
  },
  deliverySlippage: { warningDays: 3, criticalDays: 10 },
  highRiskDeal: { pendingApprovalAgeHours: 48 },
  priorityScore: {
    severityBase: { LOW: 25, MEDIUM: 50, HIGH: 75, CRITICAL: 100 },
    valueUnit: 10_000,
    valueCap: 15,
    ageUnit: 3,
    ageCap: 10,
  },
};
