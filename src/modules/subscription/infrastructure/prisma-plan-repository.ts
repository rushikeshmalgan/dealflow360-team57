import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import type { PlanRepository } from "../application/ports";
import type { SubscriptionPlanDto } from "../application/types";
import type { CreatePlanOutput, PlanListQuery, UpdatePlanOutput } from "../schemas/plan";

const planInclude = {
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
    },
  },
} satisfies Prisma.SubscriptionPlanInclude;

type PlanRecord = Prisma.SubscriptionPlanGetPayload<{ include: typeof planInclude }>;

function planDto(record: PlanRecord): SubscriptionPlanDto {
  return {
    id: record.id,
    name: record.name,
    cadence: record.cadence,
    productId: record.productId,
    product: record.product
      ? {
          id: record.product.id,
          sku: record.product.sku,
          name: record.product.name,
          price: record.product.price.toFixed(2),
        }
      : null,
    prorationRule: (record.prorationRule as Record<string, unknown>) ?? {},
    cancellationRule: (record.cancellationRule as Record<string, unknown>) ?? {},
    partialRefundRule: (record.partialRefundRule as Record<string, unknown>) ?? {},
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "A subscription plan with this name already exists", {
        target: error.meta?.target,
      });
    }
    if (error.code === "P2003") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "The plan is referenced by active subscriptions or configuration");
    }
    if (error.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "The requested subscription plan was not found");
    }
  }
  throw error;
}

export class PrismaPlanRepository implements PlanRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: PlanListQuery): Promise<SubscriptionPlanDto[]> {
    const plans = await this.db.subscriptionPlan.findMany({
      where: {
        ...(query.cadence ? { cadence: query.cadence } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.active !== undefined ? { isActive: query.active } : {}),
      },
      include: planInclude,
      orderBy: [{ name: "asc" }],
    });
    return plans.map(planDto);
  }

  async get(id: string): Promise<SubscriptionPlanDto | null> {
    const plan = await this.db.subscriptionPlan.findUnique({
      where: { id },
      include: planInclude,
    });
    return plan ? planDto(plan) : null;
  }

  async getByName(name: string): Promise<SubscriptionPlanDto | null> {
    const plan = await this.db.subscriptionPlan.findUnique({
      where: { name },
      include: planInclude,
    });
    return plan ? planDto(plan) : null;
  }

  async create(input: CreatePlanOutput): Promise<SubscriptionPlanDto> {
    try {
      return await this.db.$transaction(async (tx) => {
        if (input.productId) {
          const product = await tx.product.findUnique({
            where: { id: input.productId },
            select: { id: true },
          });
          if (!product) {
            throw new ServiceError("NOT_FOUND", "Attached product does not exist", { productId: input.productId });
          }
        }

        const created = await tx.subscriptionPlan.create({
          data: {
            name: input.name,
            cadence: input.cadence,
            productId: input.productId ?? null,
            prorationRule: input.prorationRule as Prisma.InputJsonValue,
            cancellationRule: input.cancellationRule as Prisma.InputJsonValue,
            partialRefundRule: input.partialRefundRule as Prisma.InputJsonValue,
            isActive: input.isActive ?? true,
          },
          include: planInclude,
        });

        return planDto(created);
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdatePlanOutput): Promise<SubscriptionPlanDto | null> {
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.subscriptionPlan.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) {
          return null;
        }

        if (input.productId) {
          const product = await tx.product.findUnique({
            where: { id: input.productId },
            select: { id: true },
          });
          if (!product) {
            throw new ServiceError("NOT_FOUND", "Attached product does not exist", { productId: input.productId });
          }
        }

        const updated = await tx.subscriptionPlan.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.cadence !== undefined ? { cadence: input.cadence } : {}),
            ...(input.productId !== undefined ? { productId: input.productId } : {}),
            ...(input.prorationRule !== undefined ? { prorationRule: input.prorationRule as Prisma.InputJsonValue } : {}),
            ...(input.cancellationRule !== undefined
              ? { cancellationRule: input.cancellationRule as Prisma.InputJsonValue }
              : {}),
            ...(input.partialRefundRule !== undefined
              ? { partialRefundRule: input.partialRefundRule as Prisma.InputJsonValue }
              : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          },
          include: planInclude,
        });

        return planDto(updated);
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const existing = await this.db.subscriptionPlan.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        return false;
      }

      await this.db.subscriptionPlan.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      translateWriteError(error);
    }
  }
}
