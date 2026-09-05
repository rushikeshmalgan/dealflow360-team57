import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/shared/domain/actor";

import { DiscountRuleService } from "../discount-rule-service";
import type { DiscountRuleRepository } from "../ports";
import type { DiscountRuleDto, ResolvedCeilingDto } from "../types";

const admin: Actor = { id: "actor-admin", role: "ADMIN" };
const salesRep: Actor = { id: "actor-rep", role: "SALES_REP" };
const customer: Actor = { id: "actor-cust", role: "CUSTOMER", customerId: "cust-1" };

function makeRule(overrides: Partial<DiscountRuleDto> = {}): DiscountRuleDto {
  return {
    id: "rule-1",
    scope: "TIER",
    tier: { id: "tier-1", name: "Gold" },
    category: null,
    maxDiscountPct: "15",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRepository(overrides: Partial<DiscountRuleRepository> = {}): DiscountRuleRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeRule()),
    update: vi.fn().mockResolvedValue(makeRule()),
    delete: vi.fn().mockResolvedValue(true),
    resolveCeiling: vi.fn().mockResolvedValue({} as ResolvedCeilingDto),
    ...overrides,
  };
}

describe("DiscountRuleService authorization", () => {
  it("denies list/get to an unauthenticated actor", async () => {
    const service = new DiscountRuleService(makeRepository());
    expect(() => service.list(null)).toThrow(expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }));
    await expect(service.get(null, "rule-1")).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("denies a CUSTOMER actor from reading internal governance config", async () => {
    const service = new DiscountRuleService(makeRepository());
    expect(() => service.list(customer)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("allows an internal SALES_REP actor to list rules", async () => {
    const repository = makeRepository({ list: vi.fn().mockResolvedValue([makeRule()]) });
    const service = new DiscountRuleService(repository);
    await expect(service.list(salesRep)).resolves.toHaveLength(1);
  });

  it("denies mutation to a non-admin internal actor", () => {
    const service = new DiscountRuleService(makeRepository());
    expect(() =>
      service.create(salesRep, { scope: "TIER", tierId: "tier-1", maxDiscountPct: 15, isActive: true }),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("allows an ADMIN actor to create a rule", async () => {
    const repository = makeRepository();
    const service = new DiscountRuleService(repository);
    await service.create(admin, { scope: "TIER", tierId: "tier-1", maxDiscountPct: 15, isActive: true });
    expect(repository.create).toHaveBeenCalledWith(
      { scope: "TIER", tierId: "tier-1", maxDiscountPct: 15, isActive: true },
      admin,
    );
  });

  it("throws NOT_FOUND when updating a rule that does not exist", async () => {
    const repository = makeRepository({ update: vi.fn().mockResolvedValue(null) });
    const service = new DiscountRuleService(repository);
    await expect(service.update(admin, "missing", { maxDiscountPct: 10 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when deleting a rule that does not exist", async () => {
    const repository = makeRepository({ delete: vi.fn().mockResolvedValue(false) });
    const service = new DiscountRuleService(repository);
    await expect(service.delete(admin, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("DiscountRuleService.resolveCeiling", () => {
  it("delegates to the repository's canonical lookup", async () => {
    const resolved: ResolvedCeilingDto = {
      tierId: "tier-1",
      categoryId: "cat-1",
      tierCeilingPct: "15",
      categoryCeilingPct: "10",
      allowedDiscountPct: "10",
      limitingScope: "CATEGORY",
    };
    const repository = makeRepository({ resolveCeiling: vi.fn().mockResolvedValue(resolved) });
    const service = new DiscountRuleService(repository);

    const result = await service.resolveCeiling(salesRep, "tier-1", "cat-1");

    expect(repository.resolveCeiling).toHaveBeenCalledWith("tier-1", "cat-1");
    expect(result).toEqual(resolved);
  });

  it("denies resolveCeiling to a CUSTOMER actor", () => {
    const service = new DiscountRuleService(makeRepository());
    expect(() => service.resolveCeiling(customer, "tier-1", null)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});
