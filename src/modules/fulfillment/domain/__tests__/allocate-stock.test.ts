import { describe, expect, it } from "vitest";

import { allocateAcrossWarehouses } from "../allocate-stock";

describe("allocateAcrossWarehouses", () => {
  it("allocates fully from a single warehouse when it can cover the order", () => {
    const result = allocateAcrossWarehouses(10, [
      { warehouseId: "w1", warehouseName: "Chicago", freeQty: 20, shippingCostWeight: 1 },
      { warehouseId: "w2", warehouseName: "Austin", freeQty: 5, shippingCostWeight: 1 },
    ]);
    expect(result.splits).toEqual([
      { warehouseId: "w1", warehouseName: "Chicago", quantity: 10, shippingCostWeight: 1 },
    ]);
    expect(result.shortfall).toBe(0);
  });

  it("splits across warehouses largest-free-stock-first when no single one covers it", () => {
    const result = allocateAcrossWarehouses(15, [
      { warehouseId: "w1", warehouseName: "Chicago", freeQty: 9, shippingCostWeight: 1 },
      { warehouseId: "w2", warehouseName: "Austin", freeQty: 6, shippingCostWeight: 1 },
    ]);
    expect(result.splits).toEqual([
      { warehouseId: "w1", warehouseName: "Chicago", quantity: 9, shippingCostWeight: 1 },
      { warehouseId: "w2", warehouseName: "Austin", quantity: 6, shippingCostWeight: 1 },
    ]);
    expect(result.shortfall).toBe(0);
  });

  it("reports a shortfall when total free stock is less than ordered", () => {
    const result = allocateAcrossWarehouses(20, [
      { warehouseId: "w1", warehouseName: "Chicago", freeQty: 9, shippingCostWeight: 1 },
      { warehouseId: "w2", warehouseName: "Austin", freeQty: 6, shippingCostWeight: 1 },
    ]);
    expect(result.splits.reduce((sum, s) => sum + s.quantity, 0)).toBe(15);
    expect(result.shortfall).toBe(5);
  });

  it("ignores warehouses with zero or negative free stock", () => {
    const result = allocateAcrossWarehouses(5, [
      { warehouseId: "w1", warehouseName: "Chicago", freeQty: 0, shippingCostWeight: 1 },
      { warehouseId: "w2", warehouseName: "Austin", freeQty: -3, shippingCostWeight: 1 },
      { warehouseId: "w3", warehouseName: "Newark", freeQty: 5, shippingCostWeight: 1 },
    ]);
    expect(result.splits).toHaveLength(1);
    expect(result.splits[0].warehouseId).toBe("w3");
    expect(result.shortfall).toBe(0);
  });

  it("returns a full shortfall and no splits when there is no stock anywhere", () => {
    const result = allocateAcrossWarehouses(10, []);
    expect(result.splits).toHaveLength(0);
    expect(result.shortfall).toBe(10);
  });
});
