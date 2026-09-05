import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/shared/domain/actor";

import { ApprovalRuleService } from "../approval-rule-service";
import type { ApprovalRuleRepository } from "../ports";
import type { ApprovalRuleDto } from "../types";

const admin: Actor = { id: "actor-admin", role: "ADMIN" };
const manager: Actor = { id: "actor-mgr", role: "MANAGER" };
const customer: Actor = { id: "actor-cust", role: "CUSTOMER", customerId: "cust-1" };

function makeRule(overrides: Partial<ApprovalRuleDto> = {}): ApprovalRuleDto {
  return {
    id: "rule-1",
    riskBand: "MEDIUM",
    isActive: true,
    steps: [{ id: "step-1", stepOrder: 1, role: "MANAGER" }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRepository(overrides: Partial<ApprovalRuleRepository> = {}): ApprovalRuleRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeRule()),
    update: vi.fn().mockResolvedValue(makeRule()),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("ApprovalRuleService authorization", () => {
  it("denies list/get to an unauthenticated actor", async () => {
    const service = new ApprovalRuleService(makeRepository());
    expect(() => service.list(null)).toThrow(expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }));
    await expect(service.get(null, "rule-1")).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("denies a CUSTOMER actor from reading approval governance config", async () => {
    const service = new ApprovalRuleService(makeRepository());
    expect(() => service.list(customer)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("allows an internal MANAGER actor to list rules", async () => {
    const repository = makeRepository({ list: vi.fn().mockResolvedValue([makeRule()]) });
    const service = new ApprovalRuleService(repository);
    await expect(service.list(manager)).resolves.toHaveLength(1);
  });

  it("denies mutation to a non-admin internal actor", () => {
    const service = new ApprovalRuleService(makeRepository());
    expect(() => service.create(manager, { riskBand: "LOW", isActive: true, steps: [] })).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("allows an ADMIN actor to create a rule", async () => {
    const repository = makeRepository();
    const service = new ApprovalRuleService(repository);
    await service.create(admin, { riskBand: "LOW", isActive: true, steps: [] });
    expect(repository.create).toHaveBeenCalledWith({ riskBand: "LOW", isActive: true, steps: [] }, admin);
  });

  it("throws NOT_FOUND when updating a rule that does not exist", async () => {
    const repository = makeRepository({ update: vi.fn().mockResolvedValue(null) });
    const service = new ApprovalRuleService(repository);
    await expect(service.update(admin, "missing", { isActive: false })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when deleting a rule that does not exist", async () => {
    const repository = makeRepository({ delete: vi.fn().mockResolvedValue(false) });
    const service = new ApprovalRuleService(repository);
    await expect(service.delete(admin, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
