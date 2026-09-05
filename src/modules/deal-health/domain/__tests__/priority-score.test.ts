import { describe, expect, it } from "vitest";

import { DEAL_HEALTH_CONFIG_V1 } from "../config";
import { computePriorityScore } from "../priority-score";

// severityBase: LOW 25/MEDIUM 50/HIGH 75/CRITICAL 100; valueUnit 10_000 cap 15; ageUnit 3 cap 10
const config = DEAL_HEALTH_CONFIG_V1.priorityScore;

describe("computePriorityScore", () => {
  it("is deterministic: same input always yields the same score", () => {
    const input = { severity: "HIGH" as const, dealValue: 50_000, ageDays: 12 };
    expect(computePriorityScore(input, config)).toBe(computePriorityScore(input, config));
  });

  it("uses the severity base with no value or age", () => {
    expect(computePriorityScore({ severity: "LOW", dealValue: 0, ageDays: 0 }, config)).toBe(25);
    expect(computePriorityScore({ severity: "CRITICAL", dealValue: 0, ageDays: 0 }, config)).toBe(100);
  });

  it("adds a bounded bonus for larger deal value", () => {
    const score = computePriorityScore({ severity: "MEDIUM", dealValue: 50_000, ageDays: 0 }, config);
    expect(score).toBe(50 + 5); // floor(50_000 / 10_000)
  });

  it("adds a bounded bonus for deal age", () => {
    const score = computePriorityScore({ severity: "MEDIUM", dealValue: 0, ageDays: 9 }, config);
    expect(score).toBe(50 + 3); // floor(9 / 3)
  });

  it("never exceeds 100 even with a huge value and age", () => {
    const score = computePriorityScore({ severity: "CRITICAL", dealValue: 10_000_000, ageDays: 3650 }, config);
    expect(score).toBe(100);
  });

  it("ranks a bigger, older deal above a smaller, newer one at the same severity", () => {
    const smaller = computePriorityScore({ severity: "HIGH", dealValue: 1000, ageDays: 1 }, config);
    const bigger = computePriorityScore({ severity: "HIGH", dealValue: 200_000, ageDays: 30 }, config);
    expect(bigger).toBeGreaterThan(smaller);
  });
});
