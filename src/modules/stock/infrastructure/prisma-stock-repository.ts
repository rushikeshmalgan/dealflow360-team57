import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import type {
  CreateWarehouseStockInput,
  ImportWarehouseStockInput,
  UpdateWarehouseStockInput,
  WarehouseStockQuery,
} from "../schemas/warehouse-stock";
import type { WarehouseStockRepository } from "../application/ports";
import type { WarehouseStockDto } from "../application/types";

const stockInclude = {
  warehouse: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, sku: true } },
} satisfies Prisma.WarehouseStockInclude;

type StockRecord = Prisma.WarehouseStockGetPayload<{ include: typeof stockInclude }>;

function stockDto(stock: StockRecord): WarehouseStockDto {
  return {
    id: stock.id,
    warehouse: stock.warehouse,
    product: stock.product,
    availableQty: stock.availableQty,
    reservedQty: stock.reservedQty,
    version: stock.version,
    createdAt: stock.createdAt.toISOString(),
    updatedAt: stock.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ServiceError(
        "CONFIGURATION_CONFLICT",
        "A stock record for this warehouse and product already exists",
        {
          target: error.meta?.target,
        },
      );
    }
    if (error.code === "P2003") {
      throw new ServiceError(
        "CONFIGURATION_CONFLICT",
        "The referenced warehouse or product does not exist",
      );
    }
    if (error.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "Warehouse stock record not found");
    }
  }
  throw error;
}

export class PrismaWarehouseStockRepository implements WarehouseStockRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: WarehouseStockQuery) {
    return (
      await this.db.warehouseStock.findMany({
        where: { warehouseId: query.warehouseId, productId: query.productId },
        include: stockInclude,
        orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
      })
    ).map(stockDto);
  }

  async get(id: string) {
    const stock = await this.db.warehouseStock.findUnique({ where: { id }, include: stockInclude });
    return stock ? stockDto(stock) : null;
  }

  async create(input: CreateWarehouseStockInput) {
    try {
      return stockDto(
        await this.db.warehouseStock.create({
          data: {
            warehouseId: input.warehouseId,
            productId: input.productId,
            availableQty: input.availableQty,
            reservedQty: input.reservedQty,
          },
          include: stockInclude,
        }),
      );
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateWarehouseStockInput) {
    try {
      return stockDto(
        await this.db.warehouseStock.update({
          where: { id },
          data: {
            warehouseId: input.warehouseId,
            productId: input.productId,
            availableQty: input.availableQty,
            reservedQty: input.reservedQty,
          },
          include: stockInclude,
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
      await this.db.warehouseStock.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
        return false;
      translateWriteError(error);
    }
  }

  async import(input: ImportWarehouseStockInput) {
    return this.db.$transaction(async (tx) => {
      const results: StockRecord[] = [];
      for (const item of input.items) {
        const record = await tx.warehouseStock.upsert({
          where: {
            warehouseId_productId: { warehouseId: input.warehouseId, productId: item.productId },
          },
          update: {
            availableQty: item.availableQty,
            reservedQty: item.reservedQty,
          },
          create: {
            warehouseId: input.warehouseId,
            productId: item.productId,
            availableQty: item.availableQty,
            reservedQty: item.reservedQty,
          },
          include: stockInclude,
        });
        results.push(record);
      }
      return results.map(stockDto);
    });
  }
}
