import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import { resolveDiscountCeiling } from "../domain/resolve-ceiling";
import type { CreateDiscountRuleInput, DiscountRuleQuery, UpdateDiscountRuleInput } from "../schemas/discount-rule";
import type { DiscountRuleRepository } from "../application/ports";
import type { DiscountRuleDto, ResolvedCeilingDto } from "../application/types";

const discountRuleInclude = {
  tier: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.DiscountRuleInclude;

type DiscountRuleRecord = Prisma.DiscountRuleGetPayload<{ include: typeof discountRuleInclude }>;

/**
 * The discount_rules_max_discount_pct_range CHECK constraint (T0.2 migration) stores this
 * column as a 0-1 fraction, matching every other *_pct column in the schema (products.tax_pct,
 * quotation_lines.line_discount_pct, ...). The API/DTO layer speaks in human percentages
 * (0-100), matching PRD/API_DOCS ("max_discount_pct", "18%") and every other T2 percentage
 * field's Zod schema — so the conversion happens here, at the persistence boundary.
 */
function toFraction(percent: number): Prisma.Decimal {
  return new Prisma.Decimal(percent).dividedBy(100);
}

function toPercentString(fraction: Prisma.Decimal): string {
  return fraction.times(100).toString();
}

function discountRuleDto(rule: DiscountRuleRecord): DiscountRuleDto {
  return {
    id: rule.id,
    scope: rule.scope,
    tier: rule.tier,
    category: rule.category,
    maxDiscountPct: toPercentString(rule.maxDiscountPct),
    isActive: rule.isActive,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ServiceError(
        "CONFIGURATION_CONFLICT",
        "An active discount rule already exists for this tier or category — deactivate it first or update it instead",
        { target: error.meta?.target },
      );
    }
    if (error.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "The requested discount rule was not found");
    }
  }
  throw error;
}

export class PrismaDiscountRuleRepository implements DiscountRuleRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: DiscountRuleQuery) {
    const rules = await this.db.discountRule.findMany({
      where: {
        scope: query.scope,
        tierId: query.tierId,
        categoryId: query.categoryId,
        isActive: query.active,
      },
      include: discountRuleInclude,
      orderBy: [{ scope: "asc" }, { createdAt: "asc" }],
    });
    return rules.map(discountRuleDto);
  }

  async get(id: string) {
    const rule = await this.db.discountRule.findUnique({ where: { id }, include: discountRuleInclude });
    return rule ? discountRuleDto(rule) : null;
  }

  async create(input: CreateDiscountRuleInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        if (input.scope === "TIER") {
          const tier = await tx.customerTier.findUnique({ where: { id: input.tierId! }, select: { id: true } });
          if (!tier) throw new ServiceError("NOT_FOUND", "Customer tier not found", { id: input.tierId });
        } else {
          const category = await tx.productCategory.findUnique({
            where: { id: input.categoryId! },
            select: { id: true },
          });
          if (!category) throw new ServiceError("NOT_FOUND", "Product category not found", { id: input.categoryId });
        }

        if (input.isActive) {
          const conflict = await tx.discountRule.findFirst({
            where: {
              scope: input.scope,
              isActive: true,
              tierId: input.scope === "TIER" ? input.tierId : undefined,
              categoryId: input.scope === "CATEGORY" ? input.categoryId : undefined,
            },
            select: { id: true },
          });
          if (conflict) {
            throw new ServiceError(
              "CONFIGURATION_CONFLICT",
              `An active ${input.scope.toLowerCase()} discount rule already exists for this target`,
              { scope: input.scope, tierId: input.tierId, categoryId: input.categoryId },
            );
          }
        }

        const created = await tx.discountRule.create({
          data: {
            scope: input.scope,
            tierId: input.scope === "TIER" ? input.tierId : null,
            categoryId: input.scope === "CATEGORY" ? input.categoryId : null,
            maxDiscountPct: toFraction(input.maxDiscountPct),
            isActive: input.isActive,
          },
          include: discountRuleInclude,
        });

        const dto = discountRuleDto(created);
        await recordAudit(tx, {
          actor,
          entityType: "DiscountRule",
          entityId: created.id,
          action: "CREATE",
          before: null,
          after: dto,
          reason: input.reason,
        });
        return dto;
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateDiscountRuleInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.discountRule.findUnique({ where: { id }, include: discountRuleInclude });
        if (!existing) return null;

        const willBeActive = input.isActive ?? existing.isActive;
        if (willBeActive && !existing.isActive) {
          const conflict = await tx.discountRule.findFirst({
            where: {
              id: { not: id },
              scope: existing.scope,
              isActive: true,
              tierId: existing.scope === "TIER" ? existing.tierId : undefined,
              categoryId: existing.scope === "CATEGORY" ? existing.categoryId : undefined,
            },
            select: { id: true },
          });
          if (conflict) {
            throw new ServiceError(
              "CONFIGURATION_CONFLICT",
              `An active ${existing.scope.toLowerCase()} discount rule already exists for this target`,
              { scope: existing.scope, tierId: existing.tierId, categoryId: existing.categoryId },
            );
          }
        }

        const updated = await tx.discountRule.update({
          where: { id },
          data: {
            maxDiscountPct: input.maxDiscountPct !== undefined ? toFraction(input.maxDiscountPct) : undefined,
            isActive: input.isActive,
          },
          include: discountRuleInclude,
        });

        const before = discountRuleDto(existing);
        const after = discountRuleDto(updated);
        await recordAudit(tx, {
          actor,
          entityType: "DiscountRule",
          entityId: id,
          action: "UPDATE",
          before,
          after,
          reason: input.reason,
        });
        return after;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      translateWriteError(error);
    }
  }

  async delete(id: string, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.discountRule.findUnique({ where: { id }, include: discountRuleInclude });
        if (!existing) return false;

        await tx.discountRule.delete({ where: { id } });
        await recordAudit(tx, {
          actor,
          entityType: "DiscountRule",
          entityId: id,
          action: "DELETE",
          before: discountRuleDto(existing),
          after: null,
        });
        return true;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      translateWriteError(error);
    }
  }

  async resolveCeiling(tierId: string, categoryId: string | null): Promise<ResolvedCeilingDto> {
    const [tierRule, categoryRule] = await Promise.all([
      this.db.discountRule.findFirst({
        where: { scope: "TIER", tierId, isActive: true },
        select: { maxDiscountPct: true },
      }),
      categoryId
        ? this.db.discountRule.findFirst({
            where: { scope: "CATEGORY", categoryId, isActive: true },
            select: { maxDiscountPct: true },
          })
        : Promise.resolve(null),
    ]);

    const tierCeilingPct = tierRule ? tierRule.maxDiscountPct.times(100).toNumber() : null;
    const categoryCeilingPct = categoryRule ? categoryRule.maxDiscountPct.times(100).toNumber() : null;
    const resolved = resolveDiscountCeiling({ tierCeilingPct, categoryCeilingPct });

    return {
      tierId,
      categoryId,
      tierCeilingPct: resolved.tierCeilingPct !== null ? resolved.tierCeilingPct.toString() : null,
      categoryCeilingPct: resolved.categoryCeilingPct !== null ? resolved.categoryCeilingPct.toString() : null,
      allowedDiscountPct: resolved.allowedDiscountPct !== null ? resolved.allowedDiscountPct.toString() : null,
      limitingScope: resolved.limitingScope,
    };
  }
}
