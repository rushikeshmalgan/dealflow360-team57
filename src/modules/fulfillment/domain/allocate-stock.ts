/**
 * Pure domain logic for docs/ORDERS_FLOW.md Stage 4: "a suggested warehouse split... when a
 * single warehouse can't cover the full order." No Next.js/Prisma dependency (matches the same
 * convention as src/modules/discount-risk/domain/*) — the repository supplies each warehouse's
 * free-to-allocate quantity (availableQty - reservedQty, per src/app/warehouses/page.tsx's own
 * "net sellable" definition), this function only decides how to spread one ordered quantity
 * across them.
 *
 * Greedy, largest-free-stock-first: deterministic, minimizes the number of warehouses involved
 * (fewer shipments) without needing a documented optimization objective beyond "cover the order."
 */

export type WarehouseStockOption = {
  warehouseId: string;
  warehouseName: string;
  /** availableQty - reservedQty at the time of the read. */
  freeQty: number;
  shippingCostWeight: number;
};

export type StockAllocationSplit = {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  shippingCostWeight: number;
};

export type StockAllocationResult = {
  splits: StockAllocationSplit[];
  /** Portion of the ordered quantity no warehouse had free stock for. */
  shortfall: number;
};

export function allocateAcrossWarehouses(
  orderedQty: number,
  options: readonly WarehouseStockOption[],
): StockAllocationResult {
  const sorted = [...options]
    .filter((o) => o.freeQty > 0)
    .sort((a, b) => b.freeQty - a.freeQty);

  const splits: StockAllocationSplit[] = [];
  let remaining = orderedQty;

  for (const warehouse of sorted) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, warehouse.freeQty);
    if (quantity <= 0) continue;
    splits.push({
      warehouseId: warehouse.warehouseId,
      warehouseName: warehouse.warehouseName,
      quantity,
      shippingCostWeight: warehouse.shippingCostWeight,
    });
    remaining -= quantity;
  }

  return { splits, shortfall: remaining };
}
