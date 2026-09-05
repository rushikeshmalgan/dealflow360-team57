import { z } from "zod";

const money = z.coerce.number().finite().nonnegative().max(999_999_999_999.99);
const percentage = z.coerce.number().finite().min(0).max(100);

export const productVariantInputSchema = z.object({
  attribute: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(100),
  extraPrice: money.default(0),
  sku: z.string().trim().min(1).max(100).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const createProductSchema = z
  .object({
    categoryId: z.string().uuid(),
    sku: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    price: money,
    costPrice: money.default(0),
    unit: z.string().trim().min(1).max(50),
    taxPct: percentage,
    description: z.string().trim().max(5_000).nullable().optional(),
    isSubscription: z.boolean().default(false),
    recurringCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).nullable().optional(),
    isActive: z.boolean().default(true),
    variants: z.array(productVariantInputSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.isSubscription && !value.recurringCycle) {
      ctx.addIssue({
        code: "custom",
        path: ["recurringCycle"],
        message: "Recurring cycle is required for a subscription product",
      });
    }
    if (!value.isSubscription && value.recurringCycle) {
      ctx.addIssue({
        code: "custom",
        path: ["recurringCycle"],
        message: "Recurring cycle is only valid for a subscription product",
      });
    }
  });

export const updateProductSchema = z.object({
  categoryId: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  price: money.optional(),
  costPrice: money.optional(),
  unit: z.string().trim().min(1).max(50).optional(),
  taxPct: percentage.optional(),
  description: z.string().trim().max(5_000).nullable().optional(),
  isSubscription: z.boolean().optional(),
  recurringCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).nullable().optional(),
  isActive: z.boolean().optional(),
  variants: z.array(productVariantInputSchema).optional(),
});

export const productListQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  categoryId: z.string().uuid().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
