import { z } from "zod";

const uuid = z.string().uuid();

export const overrideSplitSchema = z.object({
  splits: z
    .array(
      z.object({
        warehouseId: uuid,
        quantity: z.coerce.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export type OverrideSplitInput = z.infer<typeof overrideSplitSchema>;
