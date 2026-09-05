import { describe, expect, it } from "vitest";

import { resolveDiscountCeiling } from "../resolve-ceiling";

describe("resolveDiscountCeiling", () => {
  it("returns no ceiling when neither tier nor category rule is configured", () => {
    const result = resolveDiscountCeiling({ tierCeilingPct: null, categoryCeilingPct: null });
    expect(result).toEqual({
      tierCeilingPct: null,
      categoryCeilingPct: null,
      allowedDiscountPct: null,
      limitingScope: null,
    });
  });

  it("uses the tier ceiling when only a tier rule exists", () => {
    const result = resolveDiscountCeiling({ tierCeilingPct: 15, categoryCeilingPct: null });
    expect(result.allowedDiscountPct).toBe(15);
    expect(result.limitingScope).toBe("TIER");
  });

  it("uses the category ceiling when only a category rule exists", () => {
    const result = resolveDiscountCeiling({ tierCeilingPct: null, categoryCeilingPct: 10 });
    expect(result.allowedDiscountPct).toBe(10);
    expect(result.limitingScope).toBe("CATEGORY");
  });

  it("uses the lower ceiling when both tier and category rules exist (tier lower)", () => {
    const result = resolveDiscountCeiling({ tierCeilingPct: 8, categoryCeilingPct: 10 });
    expect(result.allowedDiscountPct).toBe(8);
    expect(result.limitingScope).toBe("TIER");
  });

  it("uses the lower ceiling when both tier and category rules exist (category lower)", () => {
    // TAD SS10 Gold example: Setup Service allowed 10% by category even though tier allows 15%.
    const result = resolveDiscountCeiling({ tierCeilingPct: 15, categoryCeilingPct: 10 });
    expect(result.allowedDiscountPct).toBe(10);
    expect(result.limitingScope).toBe("CATEGORY");
  });

  it("reports BOTH when tier and category ceilings are equal", () => {
    const result = resolveDiscountCeiling({ tierCeilingPct: 12, categoryCeilingPct: 12 });
    expect(result.allowedDiscountPct).toBe(12);
    expect(result.limitingScope).toBe("BOTH");
  });
});
