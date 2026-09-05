/**
 * TAD SS34 — Deal Health engine. Pure domain layer: no Next.js/Prisma dependency (TAD SS31),
 * mirroring discount-risk's scoreRisk.ts. Percentages are 0-100, matching every other module.
 */

export type DealHealthAlertType =
  | "STALLED_QUOTATION"
  | "DISCOUNT_ANOMALY"
  | "DELIVERY_SLIPPAGE"
  | "HIGH_RISK_DEAL";

export const DEAL_HEALTH_ALERT_TYPES: readonly DealHealthAlertType[] = [
  "STALLED_QUOTATION",
  "DISCOUNT_ANOMALY",
  "DELIVERY_SLIPPAGE",
  "HIGH_RISK_DEAL",
];

/**
 * BullMQ job name / outbox eventType for this module's evaluation work
 * (src/jobs/processors/deal-health.ts, src/jobs/deal-health-scheduler.ts). Defined here (not in
 * the jobs layer) so the application service can reference it without an import cycle - jobs
 * depend on modules, never the reverse.
 */
export const DEAL_HEALTH_EVALUATE_EVENT = "deal-health.evaluate";

/** Categorical urgency bucket — see prisma/schema.prisma's DealHealthSeverity doc comment for
 * how this differs from the computed `priorityScore`. */
export type DealHealthSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SEVERITY_RANK: Record<DealHealthSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function maxSeverity(a: DealHealthSeverity, b: DealHealthSeverity): DealHealthSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** A rule "fires" by returning a finding; returns null when the condition doesn't hold (or,
 * for discount anomaly, when there isn't enough history to judge). */
export type RuleFinding = {
  severity: DealHealthSeverity;
  /** Rule-specific explanatory data persisted verbatim to DealHealthAlert.details (JSONB). */
  details: Record<string, unknown>;
};
