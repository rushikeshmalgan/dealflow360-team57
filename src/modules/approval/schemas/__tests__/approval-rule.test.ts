import { describe, expect, it } from "vitest";

import { createApprovalRuleSchema } from "../approval-rule";

describe("createApprovalRuleSchema", () => {
  it("accepts LOW with no approval steps", () => {
    const result = createApprovalRuleSchema.safeParse({ riskBand: "LOW", steps: [] });
    expect(result.success).toBe(true);
  });

  it("accepts MEDIUM with a single manager step", () => {
    const result = createApprovalRuleSchema.safeParse({
      riskBand: "MEDIUM",
      steps: [{ stepOrder: 1, role: "MANAGER" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts HIGH with manager then finance", () => {
    const result = createApprovalRuleSchema.safeParse({
      riskBand: "HIGH",
      steps: [
        { stepOrder: 1, role: "MANAGER" },
        { stepOrder: 2, role: "FINANCE_OPS" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects overlapping step orders", () => {
    const result = createApprovalRuleSchema.safeParse({
      riskBand: "HIGH",
      steps: [
        { stepOrder: 1, role: "MANAGER" },
        { stepOrder: 1, role: "FINANCE_OPS" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("Overlapping"))).toBe(true);
    }
  });

  it("rejects a gapped step sequence", () => {
    const result = createApprovalRuleSchema.safeParse({
      riskBand: "HIGH",
      steps: [
        { stepOrder: 1, role: "MANAGER" },
        { stepOrder: 3, role: "FINANCE_OPS" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("Gapped"))).toBe(true);
    }
  });

  it("rejects a sequence that does not start at 1", () => {
    const result = createApprovalRuleSchema.safeParse({
      riskBand: "MEDIUM",
      steps: [{ stepOrder: 2, role: "MANAGER" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects Finance preceding Manager", () => {
    const result = createApprovalRuleSchema.safeParse({
      riskBand: "HIGH",
      steps: [
        { stepOrder: 1, role: "FINANCE_OPS" },
        { stepOrder: 2, role: "MANAGER" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("cannot precede"))).toBe(true);
    }
  });

  it("defaults steps to an empty array", () => {
    const parsed = createApprovalRuleSchema.parse({ riskBand: "LOW" });
    expect(parsed.steps).toEqual([]);
  });
});
