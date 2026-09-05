import { z } from "zod";

const weight = z.coerce.number().finite().nonnegative().max(999_999.9999);

export const createWarehouseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  replenishmentRule: z.record(z.string(), z.unknown()).nullable().optional(),
  shippingCostWeight: weight.default(1),
  isActive: z.boolean().default(true),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
