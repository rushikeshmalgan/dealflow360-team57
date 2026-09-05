import { WarehouseService } from "./application/warehouse-service";
import { PrismaWarehouseRepository } from "./infrastructure/prisma-warehouse-repository";

export const warehouseService = new WarehouseService(new PrismaWarehouseRepository());

export { WarehouseService } from "./application/warehouse-service";
