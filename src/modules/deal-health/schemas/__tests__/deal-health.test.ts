import { describe, expect, it } from "vitest";

import { DEAL_HEALTH_ALERT_TYPES } from "../../domain/types";
import { dealHealthAlertTypeSchema, dealHealthListQuerySchema, dismissAlertSchema } from "../deal-health";

describe("dealHealthAlertTypeSchema", () => {
  it("accepts exactly the domain's four alert types, in sync with DEAL_HEALTH_ALERT_TYPES", () => {
    expect(dealHealthAlertTypeSchema.options.sort()).toEqual([...DEAL_HEALTH_ALERT_TYPES].sort());
  });

  it("rejects an unknown type", () => {
    expect(dealHealthAlertTypeSchema.safeParse("MADE_UP").success).toBe(false);
  });
});

describe("dealHealthListQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(dealHealthListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("coerces limit from a query-string value and rejects out-of-range values", () => {
    expect(dealHealthListQuerySchema.parse({ limit: "50" })).toMatchObject({ limit: 50 });
    expect(dealHealthListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(dealHealthListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("rejects a malformed salesRepId", () => {
    expect(dealHealthListQuerySchema.safeParse({ salesRepId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("dismissAlertSchema", () => {
  it("accepts no reason", () => {
    expect(dismissAlertSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an empty-string reason", () => {
    expect(dismissAlertSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});
