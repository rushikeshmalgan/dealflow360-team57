import { describe, it, expect, vi } from "vitest";
import { WarehouseService } from "../application/warehouse-service";
import type { WarehouseRepository } from "../application/ports";
import type { Actor } from "@/modules/shared/domain/actor";

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

describe("WarehouseService", () => {
  const mockRepo: WarehouseRepository = {
    list: vi.fn().mockResolvedValue([
      {
        id: "wh-1",
        name: "Warehouse A",
        shippingCostWeight: "1.0000",
        replenishmentRule: { reorderThreshold: 10, targetStock: 50 },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]),
    get: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(
        id === "wh-1"
          ? {
              id: "wh-1",
              name: "Warehouse A",
              shippingCostWeight: "1.0000",
              replenishmentRule: null,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : null,
      ),
    ),
    create: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: "wh-new",
        name: input.name,
        shippingCostWeight: String(input.shippingCostWeight ?? 1),
        replenishmentRule: input.replenishmentRule ?? null,
        isActive: input.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),
    update: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
  };

  const service = new WarehouseService(mockRepo);

  describe("Permissions & Gating", () => {
    it("allows internal roles (Sales Rep, Admin) to list warehouses", async () => {
      const result = await service.list(salesRepActor);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Warehouse A");
    });

    it("forbids external customer actor from listing warehouses", async () => {
      expect(() => service.list(customerActor)).toThrowError(/FORBIDDEN/);
    });

    it("forbids unauthenticated null actor from listing warehouses", async () => {
      expect(() => service.list(null)).toThrowError(/AUTHENTICATION_REQUIRED/);
    });

    it("allows ADMIN to create warehouse", async () => {
      const created = await service.create(adminActor, {
        name: "Warehouse New",
        shippingCostWeight: 1.25,
        isActive: true,
      });
      expect(created.name).toBe("Warehouse New");
      expect(created.shippingCostWeight).toBe("1.25");
    });

    it("forbids non-admin (Sales Rep) from creating warehouse", async () => {
      expect(() =>
        service.create(salesRepActor, {
          name: "Illegal Hub",
          shippingCostWeight: 1,
          isActive: true,
        }),
      ).toThrowError(/FORBIDDEN/);
    });
  });
});
