import type { DealHealthConfig } from "../config";
import { maxSeverity, type RuleFinding } from "../types";

const HOUR_MS = 60 * 60 * 1000;

export type HighRiskDealInput = {
  /** The quotation's latest RiskEvaluation (T7.1's scoreRisk output, read-only - this feature
   * never recomputes or changes the risk algorithm). Null if the quote was never submitted. */
  riskBand: "LOW" | "MEDIUM" | "HIGH" | null;
  riskScore: number | null;
  /** When the oldest still-PENDING FINANCE_OPS approval step (on the latest version) was
   * created, or null if none is pending. */
  pendingFinanceApprovalSince: Date | null;
  now: Date;
};

/** TAD SS34: latest risk band is HIGH, or Finance approval has been pending beyond a configured age. */
export function evaluateHighRiskDeal(
  input: HighRiskDealInput,
  config: DealHealthConfig["highRiskDeal"],
): RuleFinding | null {
  let severity: RuleFinding["severity"] | null = null;
  const reasons: string[] = [];
  let pendingApprovalAgeHours: number | null = null;

  if (input.riskBand === "HIGH") {
    reasons.push("RISK_BAND_HIGH");
    severity = "HIGH";
  }

  if (input.pendingFinanceApprovalSince) {
    pendingApprovalAgeHours = (input.now.getTime() - input.pendingFinanceApprovalSince.getTime()) / HOUR_MS;
    if (pendingApprovalAgeHours > config.pendingApprovalAgeHours) {
      reasons.push("FINANCE_APPROVAL_OVERDUE");
      const ratio = pendingApprovalAgeHours / config.pendingApprovalAgeHours;
      const overdueSeverity = ratio >= 3 ? "CRITICAL" : ratio >= 2 ? "HIGH" : "MEDIUM";
      severity = severity ? maxSeverity(severity, overdueSeverity) : overdueSeverity;
    }
  }

  if (!severity) return null;

  return {
    severity,
    details: {
      riskScore: input.riskScore,
      riskBand: input.riskBand,
      pendingApprovalAgeHours:
        pendingApprovalAgeHours === null ? null : Math.round(pendingApprovalAgeHours * 100) / 100,
      pendingApprovalAgeThresholdHours: config.pendingApprovalAgeHours,
      reasons,
    },
  };
}
