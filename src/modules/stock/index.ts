import { WarehouseStockService } from "./application/warehouse-stock-service";
import { PrismaWarehouseStockRepository } from "./infrastructure/prisma-stock-repository";

export const warehouseStockService = new WarehouseStockService(
  new PrismaWarehouseStockRepository(),
);

export { WarehouseStockService } from "./application/warehouse-stock-service";
export type { WarehouseStockDto } from "./application/types";
