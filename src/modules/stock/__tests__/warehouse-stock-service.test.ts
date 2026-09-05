import { describe, it, expect, vi } from "vitest";
import { WarehouseStockService } from "../application/warehouse-stock-service";
import type { WarehouseStockRepository } from "../application/ports";
import type { Actor } from "@/modules/shared/domain/actor";
import {
  createWarehouseStockSchema,
  importWarehouseStockSchema,
} from "../schemas/warehouse-stock";

const adminActor: Actor = {
  id: "u-admin",
  role: "ADMIN",
  customerId: null,
};

const salesRepActor: Actor = {
  id: "u-rep",
  role: "SALES_REP",
  customerId: null,
};

const customerActor: Actor = {
  id: "u-cust",
  role: "CUSTOMER",
  customerId: "cust-123",
};

describe("WarehouseStockService & Schemas", () => {
  const mockRepo: WarehouseStockRepository = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: "stock-1",
        warehouse: { id: input.warehouseId, name: "Warehouse A" },
        product: { id: input.productId, name: "Laptop Pro", sku: "HW-1" },
        availableQty: input.availableQty,
        reservedQty: input.reservedQty,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),
    update: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    import: vi.fn().mockResolvedValue([]),
  };

  const service = new WarehouseStockService(mockRepo);

  describe("Role-based Access Control", () => {
    it("allows internal user to query stock", async () => {
      const result = await service.list(salesRepActor);
      expect(Array.isArray(result)).toBe(true);
    });

    it("forbids external customer from viewing warehouse stock", async () => {
      expect(() => service.list(customerActor)).toThrowError(/FORBIDDEN/);
    });

    it("allows ADMIN to create stock record", async () => {
      const created = await service.create(adminActor, {
        warehouseId: "4112de4b-3e68-4e7f-8962-392d4b2bfe69",
        productId: "b41a9a91-e2fc-4c08-b6b9-f3ab9d8cb97b",
        availableQty: 50,
        reservedQty: 5,
      });
      expect(created.availableQty).toBe(50);
      expect(created.reservedQty).toBe(5);
    });

    it("denies non-admin (Sales Rep) from creating stock", async () => {
      expect(() =>
        service.create(salesRepActor, {
          warehouseId: "4112de4b-3e68-4e7f-8962-392d4b2bfe69",
          productId: "b41a9a91-e2fc-4c08-b6b9-f3ab9d8cb97b",
          availableQty: 10,
          reservedQty: 0,
        }),
      ).toThrowError(/FORBIDDEN/);
    });
  });

  describe("Schema Invariants & Validation", () => {
    it("accepts valid stock where reservedQty <= availableQty", () => {
      const parsed = createWarehouseStockSchema.safeParse({
        warehouseId: "4112de4b-3e68-4e7f-8962-392d4b2bfe69",
        productId: "b41a9a91-e2fc-4c08-b6b9-f3ab9d8cb97b",
        availableQty: 25,
        reservedQty: 10,
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects stock record where reservedQty > availableQty", () => {
      const parsed = createWarehouseStockSchema.safeParse({
        warehouseId: "4112de4b-3e68-4e7f-8962-392d4b2bfe69",
        productId: "b41a9a91-e2fc-4c08-b6b9-f3ab9d8cb97b",
        availableQty: 10,
        reservedQty: 20, // Violation!
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain("reservedQty cannot exceed availableQty");
      }
    });

    it("rejects batch import with duplicate product IDs in the same warehouse", () => {
      const parsed = importWarehouseStockSchema.safeParse({
        warehouseId: "4112de4b-3e68-4e7f-8962-392d4b2bfe69",
        items: [
          {
            productId: "b41a9a91-e2fc-4c08-b6b9-f3ab9d8cb97b",
            availableQty: 20,
            reservedQty: 0,
          },
          {
            productId: "b41a9a91-e2fc-4c08-b6b9-f3ab9d8cb97b", // duplicate!
            availableQty: 30,
            reservedQty: 5,
          },
        ],
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain("Duplicate product in import batch");
      }
    });
  });
});
