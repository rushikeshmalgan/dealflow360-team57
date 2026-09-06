import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/shared/domain/actor";

import { PrismaApprovalRuleRepository } from "../prisma-approval-rule-repository";

describe.skipIf(!process.env.DATABASE_URL)("PrismaApprovalRuleRepository (integration)", () => {
  const repository = new PrismaApprovalRuleRepository();
  let actor: Actor;
  const createdRuleIds: string[] = [];

  // riskBand is unique with at most one row per band, so this suite needs the table empty to
  // freely create LOW/MEDIUM/HIGH rules — but prisma/seed.ts now permanently provisions demo
  // MEDIUM/HIGH approval rules (needed for the live app to route quotations at all), so those
  // would otherwise collide with this test every time someone reseeds before running tests.
  // Snapshot-and-restore instead of assuming an empty table.
  let preExistingRules: Awaited<ReturnType<typeof prisma.approvalRule.findMany<{ include: { steps: true } }>>> = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { passwordHash: "test-fixture", email: `admin+${randomUUID()}@test.local`, role: "ADMIN" },
    });
    actor = { id: user.id, role: "ADMIN" };

    preExistingRules = await prisma.approvalRule.findMany({ include: { steps: true } });
    const preExistingIds = preExistingRules.map((r) => r.id);
    await prisma.approvalStep.deleteMany({ where: { approvalRuleId: { in: preExistingIds } } });
    await prisma.approvalRule.deleteMany({ where: { id: { in: preExistingIds } } });
  });

  afterAll(async () => {
    await prisma.approvalStep.deleteMany({ where: { approvalRuleId: { in: createdRuleIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdRuleIds } } });
    await prisma.approvalRule.deleteMany({ where: { id: { in: createdRuleIds } } });
    await prisma.user.delete({ where: { id: actor.id } });

    for (const rule of preExistingRules) {
      await prisma.approvalRule.create({
        data: {
          id: rule.id,
          riskBand: rule.riskBand,
          isActive: rule.isActive,
          steps: {
            create: rule.steps.map((s) => ({ stepOrder: s.stepOrder, role: s.role })),
          },
        },
      });
    }
  });

  it("creates a LOW rule with no steps and an audit row", async () => {
    const created = await repository.create({ riskBand: "LOW", isActive: true, steps: [], reason: "seed" }, actor);
    createdRuleIds.push(created.id);

    expect(created.steps).toEqual([]);

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "ApprovalRule", entityId: created.id } });
    expect(audit?.action).toBe("CREATE");
    expect(audit?.actorUserId).toBe(actor.id);
  });

  it("creates a HIGH rule with manager-then-finance ordered steps", async () => {
    const created = await repository.create(
      {
        riskBand: "HIGH",
        isActive: true,
        steps: [
          { stepOrder: 1, role: "MANAGER" },
          { stepOrder: 2, role: "FINANCE_OPS" },
        ],
      },
      actor,
    );
    createdRuleIds.push(created.id);

    expect(created.steps.map((s) => [s.stepOrder, s.role])).toEqual([
      [1, "MANAGER"],
      [2, "FINANCE_OPS"],
    ]);
  });

  it("rejects a second rule for a risk band that already has one (DB unique backstop)", async () => {
    await expect(repository.create({ riskBand: "LOW", isActive: true, steps: [] }, actor)).rejects.toMatchObject({
      code: "CONFIGURATION_CONFLICT",
    });
  });

  it("replaces steps on update and records a before/after audit snapshot", async () => {
    const created = await repository.create(
      { riskBand: "MEDIUM", isActive: true, steps: [{ stepOrder: 1, role: "MANAGER" }] },
      actor,
    );
    createdRuleIds.push(created.id);

    const updated = await repository.update(
      created.id,
      { steps: [{ stepOrder: 1, role: "MANAGER" }, { stepOrder: 2, role: "FINANCE_OPS" }], reason: "escalation policy change" },
      actor,
    );
    expect(updated?.steps).toHaveLength(2);

    const remainingSteps = await prisma.approvalStep.findMany({ where: { approvalRuleId: created.id } });
    expect(remainingSteps).toHaveLength(2);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "ApprovalRule", entityId: created.id, action: "UPDATE" },
    });
    expect(audit?.reason).toBe("escalation policy change");
    expect(Array.isArray((audit?.before as { steps?: unknown[] })?.steps)).toBe(true);
    expect((audit?.before as { steps?: unknown[] })?.steps).toHaveLength(1);
    expect((audit?.after as { steps?: unknown[] })?.steps).toHaveLength(2);
  });

  it("deletes a rule, cascades its steps, and records the DELETE audit entry", async () => {
    // riskBand is unique, so reuse the HIGH rule created earlier rather than
    // creating another one (which would hit the same conflict as the test above).
    const highRule = await prisma.approvalRule.findUniqueOrThrow({ where: { riskBand: "HIGH" } });

    const deleted = await repository.delete(highRule.id, actor);
    expect(deleted).toBe(true);

    const remainingSteps = await prisma.approvalStep.findMany({ where: { approvalRuleId: highRule.id } });
    expect(remainingSteps).toHaveLength(0);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "ApprovalRule", entityId: highRule.id, action: "DELETE" },
    });
    expect(audit).not.toBeNull();
  });
});
