import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import { PrismaDiscountRuleRepository } from "../prisma-discount-rule-repository";

/**
 * Hits the real dev Postgres (docker-compose) rather than mocking Prisma, so the
 * partial-unique-index backstop and the audit-log write are exercised for real —
 * a fake repository can't prove either of those actually persists correctly.
 */
describe.skipIf(!process.env.DATABASE_URL)("PrismaDiscountRuleRepository (integration)", () => {
  const repository = new PrismaDiscountRuleRepository();
  let actor: Actor;
  let tierAId: string;
  let tierBId: string;
  let categoryId: string;
  const createdRuleIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, email: `admin+${randomUUID()}@test.local`, role: "ADMIN" },
    });
    actor = { id: user.id, role: "ADMIN" };

    const tierA = await prisma.customerTier.create({ data: { name: `T3-Test-Tier-A-${randomUUID()}` } });
    const tierB = await prisma.customerTier.create({ data: { name: `T3-Test-Tier-B-${randomUUID()}` } });
    const category = await prisma.productCategory.create({ data: { name: `T3-Test-Category-${randomUUID()}` } });
    tierAId = tierA.id;
    tierBId = tierB.id;
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.discountRule.deleteMany({ where: { OR: [{ tierId: { in: [tierAId, tierBId] } }, { categoryId }] } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdRuleIds } } });
    await prisma.customerTier.deleteMany({ where: { id: { in: [tierAId, tierBId] } } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: actor.id } });
  });

  it("rejects creating a TIER rule for a tier that does not exist", async () => {
    await expect(
      repository.create(
        { scope: "TIER", tierId: randomUUID(), categoryId: undefined, maxDiscountPct: 15, isActive: true },
        actor,
      ),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("creates a TIER discount rule and writes an audit log row", async () => {
    const created = await repository.create(
      { scope: "TIER", tierId: tierAId, categoryId: undefined, maxDiscountPct: 15, isActive: true, reason: "seed" },
      actor,
    );
    createdRuleIds.push(created.id);

    expect(created.scope).toBe("TIER");
    expect(created.maxDiscountPct).toBe("15");
    expect(created.tier?.id).toBe(tierAId);

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "DiscountRule", entityId: created.id } });
    expect(audit).not.toBeNull();
    expect(audit?.action).toBe("CREATE");
    expect(audit?.actorUserId).toBe(actor.id);
    expect(audit?.reason).toBe("seed");
  });

  it("rejects a second active TIER rule for the same tier (app-level + DB backstop)", async () => {
    await expect(
      repository.create({ scope: "TIER", tierId: tierAId, categoryId: undefined, maxDiscountPct: 20, isActive: true }, actor),
    ).rejects.toMatchObject({ code: "CONFIGURATION_CONFLICT" });
  });

  it("allows a second INACTIVE rule for the same tier", async () => {
    const created = await repository.create(
      { scope: "TIER", tierId: tierAId, categoryId: undefined, maxDiscountPct: 5, isActive: false },
      actor,
    );
    createdRuleIds.push(created.id);
    expect(created.isActive).toBe(false);
  });

  it("rejects reactivating an inactive rule when an active one already exists for the same target", async () => {
    const inactive = await repository.create(
      { scope: "TIER", tierId: tierBId, categoryId: undefined, maxDiscountPct: 8, isActive: false },
      actor,
    );
    createdRuleIds.push(inactive.id);
    const active = await repository.create(
      { scope: "TIER", tierId: tierBId, categoryId: undefined, maxDiscountPct: 12, isActive: true },
      actor,
    );
    createdRuleIds.push(active.id);

    await expect(repository.update(inactive.id, { isActive: true }, actor)).rejects.toMatchObject({
      code: "CONFIGURATION_CONFLICT",
    });
  });

  it("updates maxDiscountPct and records a before/after audit snapshot", async () => {
    const rule = await repository.create(
      { scope: "CATEGORY", tierId: undefined, categoryId, maxDiscountPct: 10, isActive: true },
      actor,
    );
    createdRuleIds.push(rule.id);

    const updated = await repository.update(rule.id, { maxDiscountPct: 12, reason: "quarterly review" }, actor);
    expect(updated?.maxDiscountPct).toBe("12");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "DiscountRule", entityId: rule.id, action: "UPDATE" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.before as { maxDiscountPct?: string })?.maxDiscountPct).toBe("10");
    expect((audit?.after as { maxDiscountPct?: string })?.maxDiscountPct).toBe("12");
    expect(audit?.reason).toBe("quarterly review");
  });

  it("deletes a rule and records the DELETE audit entry", async () => {
    const rule = await repository.create(
      { scope: "CATEGORY", tierId: undefined, categoryId, maxDiscountPct: 3, isActive: false },
      actor,
    );
    createdRuleIds.push(rule.id);

    const deleted = await repository.delete(rule.id, actor);
    expect(deleted).toBe(true);
    expect(await repository.get(rule.id)).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "DiscountRule", entityId: rule.id, action: "DELETE" },
    });
    expect(audit).not.toBeNull();
  });

  it("resolveCeiling uses the lower of tier and category ceilings (TAD SS10)", async () => {
    // tierAId already has an active 15% rule, and categoryId an active 12% rule
    // (updated from 10% earlier in this file) — reuse that state rather than
    // creating a second active rule for the same target, which would conflict.
    const resolved = await repository.resolveCeiling(tierAId, categoryId);
    expect(resolved.tierCeilingPct).toBe("15");
    expect(resolved.categoryCeilingPct).toBe("12");
    expect(resolved.allowedDiscountPct).toBe("12");
    expect(resolved.limitingScope).toBe("CATEGORY");
  });
});
