import { describe, expect, it } from "vitest";

import { createDiscountRuleSchema, updateDiscountRuleSchema } from "../discount-rule";

const tierId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";

describe("createDiscountRuleSchema", () => {
  it("accepts a valid TIER rule", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "TIER", tierId, maxDiscountPct: 15 });
    expect(result.success).toBe(true);
  });

  it("accepts a valid CATEGORY rule", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "CATEGORY", categoryId, maxDiscountPct: 10 });
    expect(result.success).toBe(true);
  });

  it("rejects a TIER rule missing tierId", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "TIER", maxDiscountPct: 15 });
    expect(result.success).toBe(false);
  });

  it("rejects a TIER rule that also sets categoryId", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "TIER", tierId, categoryId, maxDiscountPct: 15 });
    expect(result.success).toBe(false);
  });

  it("rejects a CATEGORY rule missing categoryId", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "CATEGORY", maxDiscountPct: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a CATEGORY rule that also sets tierId", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "CATEGORY", tierId, categoryId, maxDiscountPct: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a discount percentage above 100", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "TIER", tierId, maxDiscountPct: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative discount percentage", () => {
    const result = createDiscountRuleSchema.safeParse({ scope: "TIER", tierId, maxDiscountPct: -1 });
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true", () => {
    const result = createDiscountRuleSchema.parse({ scope: "TIER", tierId, maxDiscountPct: 15 });
    expect(result.isActive).toBe(true);
  });
});

describe("updateDiscountRuleSchema", () => {
  it("allows a partial update with only isActive", () => {
    const result = updateDiscountRuleSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it("does not accept scope/tierId/categoryId retargeting fields", () => {
    const parsed = updateDiscountRuleSchema.parse({ maxDiscountPct: 20 });
    expect(parsed).not.toHaveProperty("scope");
    expect(parsed).not.toHaveProperty("tierId");
  });
});
