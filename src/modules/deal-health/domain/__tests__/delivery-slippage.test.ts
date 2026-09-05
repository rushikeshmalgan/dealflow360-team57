import { describe, expect, it } from "vitest";

import { DEAL_HEALTH_CONFIG_V1 } from "../config";
import { evaluateDeliverySlippage } from "../rules/delivery-slippage";

const config = DEAL_HEALTH_CONFIG_V1.deliverySlippage; // warningDays: 3, criticalDays: 10
const promisedDate = new Date("2026-06-01T00:00:00.000Z");

function daysAfterPromised(days: number): Date {
  return new Date(promisedDate.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("evaluateDeliverySlippage", () => {
  it("does not fire when the estimate is on or before the promised date", () => {
    expect(evaluateDeliverySlippage({ promisedDate, currentEstimateDate: promisedDate }, config)).toBeNull();
    expect(
      evaluateDeliverySlippage({ promisedDate, currentEstimateDate: daysAfterPromised(-2) }, config),
    ).toBeNull();
  });

  it("fires MEDIUM for slippage at or under the warning threshold", () => {
    const finding = evaluateDeliverySlippage({ promisedDate, currentEstimateDate: daysAfterPromised(2) }, config);
    expect(finding?.severity).toBe("MEDIUM");
    expect(finding?.details).toMatchObject({ daysLate: 2 });
  });

  it("fires HIGH between the warning and critical thresholds", () => {
    const finding = evaluateDeliverySlippage({ promisedDate, currentEstimateDate: daysAfterPromised(7) }, config);
    expect(finding?.severity).toBe("HIGH");
  });

  it("fires CRITICAL beyond the critical threshold", () => {
    const finding = evaluateDeliverySlippage({ promisedDate, currentEstimateDate: daysAfterPromised(15) }, config);
    expect(finding?.severity).toBe("CRITICAL");
    expect(finding?.details).toMatchObject({
      promisedDate: promisedDate.toISOString(),
      currentEstimateDate: daysAfterPromised(15).toISOString(),
    });
  });
});
