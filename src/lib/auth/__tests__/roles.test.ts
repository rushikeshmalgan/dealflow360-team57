import { describe, it, expect } from "vitest";

import { APP_ROLES, isValidRole } from "../roles";
import type { AppRole } from "../roles";

describe("APP_ROLES", () => {
  it("contains exactly the five required roles", () => {
    expect(APP_ROLES).toEqual([
      "ADMIN",
      "SALES_REP",
      "MANAGER",
      "FINANCE_OPS",
      "CUSTOMER",
    ]);
  });

  it("has exactly 5 roles", () => {
    expect(APP_ROLES).toHaveLength(5);
  });
});

describe("isValidRole", () => {
  it.each<AppRole>(["ADMIN", "SALES_REP", "MANAGER", "FINANCE_OPS", "CUSTOMER"])(
    "returns true for valid role: %s",
    (role) => {
      expect(isValidRole(role)).toBe(true);
    },
  );

  it("returns false for an unknown role string", () => {
    expect(isValidRole("SUPERADMIN")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isValidRole("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidRole(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidRole(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isValidRole(42)).toBe(false);
  });

  it("returns false for a lowercase role name", () => {
    expect(isValidRole("admin")).toBe(false);
  });

  it("returns false for an object", () => {
    expect(isValidRole({ role: "ADMIN" })).toBe(false);
  });
});
