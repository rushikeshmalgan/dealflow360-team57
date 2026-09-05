import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import type { CreateWarehouseInput, UpdateWarehouseInput } from "../schemas/warehouse";
import type { WarehouseRepository } from "../application/ports";
import type { WarehouseDto } from "../application/types";

function warehouseDto(warehouse: {
  id: string;
  name: string;
  replenishmentRule: Prisma.JsonValue;
  shippingCostWeight: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WarehouseDto {
  return {
    id: warehouse.id,
    name: warehouse.name,
    replenishmentRule: warehouse.replenishmentRule as Record<string, unknown> | null,
    shippingCostWeight: warehouse.shippingCostWeight.toString(),
    isActive: warehouse.isActive,
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
  };
}

function jsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as unknown as Prisma.InputJsonValue;
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ServiceError(
        "CONFIGURATION_CONFLICT",
        "A warehouse with this name already exists",
        {
          target: error.meta?.target,
        },
      );
    }
    if (error.code === "P2003") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "The record is referenced by other data");
    }
    if (error.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "Warehouse not found");
    }
  }
  throw error;
}

export class PrismaWarehouseRepository implements WarehouseRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list() {
    return (await this.db.warehouse.findMany({ orderBy: { name: "asc" } })).map(warehouseDto);
  }

  async get(id: string) {
    const warehouse = await this.db.warehouse.findUnique({ where: { id } });
    return warehouse ? warehouseDto(warehouse) : null;
  }

  async create(input: CreateWarehouseInput) {
    try {
      return warehouseDto(
        await this.db.warehouse.create({
          data: {
            name: input.name,
            replenishmentRule: jsonInput(input.replenishmentRule),
            shippingCostWeight: input.shippingCostWeight,
            isActive: input.isActive,
          },
        }),
      );
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateWarehouseInput) {
    try {
      return warehouseDto(
        await this.db.warehouse.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.replenishmentRule !== undefined && {
              replenishmentRule: jsonInput(input.replenishmentRule),
            }),
            ...(input.shippingCostWeight !== undefined && {
              shippingCostWeight: input.shippingCostWeight,
            }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
          },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
        return null;
      translateWriteError(error);
    }
  }

  async delete(id: string) {
    try {
      await this.db.warehouse.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
        return false;
      translateWriteError(error);
    }
  }
}
