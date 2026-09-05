import { z } from "zod";

const nonnegInt = z.coerce.number().int().nonnegative();

export const createWarehouseStockSchema = z
  .object({
    warehouseId: z.string().uuid(),
    productId: z.string().uuid(),
    availableQty: nonnegInt,
    reservedQty: nonnegInt.default(0),
  })
  .superRefine((value, ctx) => {
    if (value.reservedQty > value.availableQty) {
      ctx.addIssue({
        code: "custom",
        path: ["reservedQty"],
        message: "reservedQty cannot exceed availableQty",
      });
    }
  });

export const updateWarehouseStockSchema = z
  .object({
    warehouseId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    availableQty: nonnegInt.optional(),
    reservedQty: nonnegInt.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.reservedQty !== undefined &&
      value.availableQty !== undefined &&
      value.reservedQty > value.availableQty
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reservedQty"],
        message: "reservedQty cannot exceed availableQty",
      });
    }
  });

export const importWarehouseStockItemSchema = z
  .object({
    productId: z.string().uuid(),
    availableQty: nonnegInt,
    reservedQty: nonnegInt.default(0),
  })
  .superRefine((value, ctx) => {
    if (value.reservedQty > value.availableQty) {
      ctx.addIssue({
        code: "custom",
        path: ["reservedQty"],
        message: "reservedQty cannot exceed availableQty",
      });
    }
  });

export const importWarehouseStockSchema = z
  .object({
    warehouseId: z.string().uuid(),
    items: z.array(importWarehouseStockItemSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      const key = `${item.productId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Duplicate product in import batch",
        });
      }
      seen.add(key);
      if (item.reservedQty > item.availableQty) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "reservedQty"],
          message: "reservedQty cannot exceed availableQty",
        });
      }
    });
  });

export const warehouseStockQuerySchema = z.object({
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

export type CreateWarehouseStockInput = z.infer<typeof createWarehouseStockSchema>;
export type UpdateWarehouseStockInput = z.infer<typeof updateWarehouseStockSchema>;
export type ImportWarehouseStockInput = z.infer<typeof importWarehouseStockSchema>;
export type WarehouseStockQuery = z.infer<typeof warehouseStockQuerySchema>;
