import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import type { ApprovalRuleQuery, CreateApprovalRuleInput, UpdateApprovalRuleInput } from "../schemas/approval-rule";
import type { ApprovalRuleRepository } from "../application/ports";
import type { ApprovalRuleDto } from "../application/types";

const approvalRuleInclude = {
  steps: { orderBy: { stepOrder: "asc" } },
} satisfies Prisma.ApprovalRuleInclude;

type ApprovalRuleRecord = Prisma.ApprovalRuleGetPayload<{ include: typeof approvalRuleInclude }>;

function approvalRuleDto(rule: ApprovalRuleRecord): ApprovalRuleDto {
  return {
    id: rule.id,
    riskBand: rule.riskBand,
    isActive: rule.isActive,
    steps: rule.steps.map((step) => ({ id: step.id, stepOrder: step.stepOrder, role: step.role })),
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
        "An approval rule for this risk band already exists — use PUT to update it instead",
        { target: error.meta?.target },
      );
    }
    if (error.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "The requested approval rule was not found");
    }
  }
  throw error;
}

export class PrismaApprovalRuleRepository implements ApprovalRuleRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: ApprovalRuleQuery) {
    const rules = await this.db.approvalRule.findMany({
      where: { riskBand: query.riskBand, isActive: query.active },
      include: approvalRuleInclude,
      orderBy: { riskBand: "asc" },
    });
    return rules.map(approvalRuleDto);
  }

  async get(id: string) {
    const rule = await this.db.approvalRule.findUnique({ where: { id }, include: approvalRuleInclude });
    return rule ? approvalRuleDto(rule) : null;
  }

  async create(input: CreateApprovalRuleInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const created = await tx.approvalRule.create({
          data: {
            riskBand: input.riskBand,
            isActive: input.isActive,
            steps: { create: input.steps },
          },
          include: approvalRuleInclude,
        });

        const dto = approvalRuleDto(created);
        await recordAudit(tx, {
          actor,
          entityType: "ApprovalRule",
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

  async update(id: string, input: UpdateApprovalRuleInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.approvalRule.findUnique({ where: { id }, include: approvalRuleInclude });
        if (!existing) return null;

        if (input.steps) {
          await tx.approvalStep.deleteMany({ where: { approvalRuleId: id } });
        }

        const updated = await tx.approvalRule.update({
          where: { id },
          data: {
            isActive: input.isActive,
            ...(input.steps ? { steps: { create: input.steps } } : {}),
          },
          include: approvalRuleInclude,
        });

        const before = approvalRuleDto(existing);
        const after = approvalRuleDto(updated);
        await recordAudit(tx, {
          actor,
          entityType: "ApprovalRule",
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
        const existing = await tx.approvalRule.findUnique({ where: { id }, include: approvalRuleInclude });
        if (!existing) return false;

        await tx.approvalStep.deleteMany({ where: { approvalRuleId: id } });
        await tx.approvalRule.delete({ where: { id } });
        await recordAudit(tx, {
          actor,
          entityType: "ApprovalRule",
          entityId: id,
          action: "DELETE",
          before: approvalRuleDto(existing),
          after: null,
        });
        return true;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      translateWriteError(error);
    }
  }
}
