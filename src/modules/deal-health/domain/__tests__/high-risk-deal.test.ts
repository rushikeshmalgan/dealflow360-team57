import { describe, expect, it } from "vitest";

import { DEAL_HEALTH_CONFIG_V1 } from "../config";
import { evaluateHighRiskDeal } from "../rules/high-risk-deal";

const config = DEAL_HEALTH_CONFIG_V1.highRiskDeal; // pendingApprovalAgeHours: 48
const NOW = new Date("2026-06-01T00:00:00.000Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

describe("evaluateHighRiskDeal", () => {
  it("does not fire for a LOW/MEDIUM band with no pending finance approval", () => {
    expect(
      evaluateHighRiskDeal({ riskBand: "MEDIUM", riskScore: 40, pendingFinanceApprovalSince: null, now: NOW }, config),
    ).toBeNull();
  });

  it("fires HIGH when the latest risk band is HIGH, independent of approvals", () => {
    const finding = evaluateHighRiskDeal(
      { riskBand: "HIGH", riskScore: 80, pendingFinanceApprovalSince: null, now: NOW },
      config,
    );
    expect(finding?.severity).toBe("HIGH");
    expect(finding?.details).toMatchObject({ riskBand: "HIGH", riskScore: 80, reasons: ["RISK_BAND_HIGH"] });
  });

  it("does not fire when finance approval is pending under the configured age", () => {
    expect(
      evaluateHighRiskDeal(
        { riskBand: "LOW", riskScore: 5, pendingFinanceApprovalSince: hoursAgo(10), now: NOW },
        config,
      ),
    ).toBeNull();
  });

  it("fires when finance approval has been pending beyond the configured age, even with a LOW risk band", () => {
    const finding = evaluateHighRiskDeal(
      { riskBand: "LOW", riskScore: 5, pendingFinanceApprovalSince: hoursAgo(60), now: NOW },
      config,
    );
    expect(finding?.severity).toBe("MEDIUM");
    expect(finding?.details).toMatchObject({ reasons: ["FINANCE_APPROVAL_OVERDUE"], pendingApprovalAgeHours: 60 });
  });

  it("escalates approval-overdue severity with how far past the threshold it is", () => {
    const high = evaluateHighRiskDeal(
      { riskBand: "LOW", riskScore: 5, pendingFinanceApprovalSince: hoursAgo(100), now: NOW },
      config,
    );
    const critical = evaluateHighRiskDeal(
      { riskBand: "LOW", riskScore: 5, pendingFinanceApprovalSince: hoursAgo(200), now: NOW },
      config,
    );
    expect(high?.severity).toBe("HIGH");
    expect(critical?.severity).toBe("CRITICAL");
  });

  it("takes the max severity and lists both reasons when both conditions hold", () => {
    const finding = evaluateHighRiskDeal(
      { riskBand: "HIGH", riskScore: 90, pendingFinanceApprovalSince: hoursAgo(200), now: NOW },
      config,
    );
    expect(finding?.severity).toBe("CRITICAL");
    expect(finding?.details.reasons).toEqual(["RISK_BAND_HIGH", "FINANCE_APPROVAL_OVERDUE"]);
  });
});
