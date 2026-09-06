import { describe, expect, it } from "vitest";

import { addRecommendationToQuoteSchema, generateRecommendationsSchema } from "../recommendation";

describe("generateRecommendationsSchema", () => {
  it("accepts a valid quotationId", () => {
    const result = generateRecommendationsSchema.parse({ quotationId: "11111111-1111-4111-8111-111111111111" });
    expect(result.quotationId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects a non-UUID quotationId", () => {
    expect(() => generateRecommendationsSchema.parse({ quotationId: "not-a-uuid" })).toThrow();
  });

  it("rejects a missing quotationId", () => {
    expect(() => generateRecommendationsSchema.parse({})).toThrow();
  });
});

describe("addRecommendationToQuoteSchema", () => {
  it("accepts a positive integer expectedVersion", () => {
    expect(addRecommendationToQuoteSchema.parse({ expectedVersion: 3 })).toEqual({ expectedVersion: 3 });
  });

  it("coerces a numeric string expectedVersion", () => {
    expect(addRecommendationToQuoteSchema.parse({ expectedVersion: "3" })).toEqual({ expectedVersion: 3 });
  });

  it("rejects a zero or negative expectedVersion", () => {
    expect(() => addRecommendationToQuoteSchema.parse({ expectedVersion: 0 })).toThrow();
    expect(() => addRecommendationToQuoteSchema.parse({ expectedVersion: -1 })).toThrow();
  });

  it("rejects a non-integer expectedVersion", () => {
    expect(() => addRecommendationToQuoteSchema.parse({ expectedVersion: 1.5 })).toThrow();
  });
});
