import { z } from "zod";

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be an ISO-style three-letter code"));

export const priceListItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional().default(null),
  unitPrice: z.coerce.number().finite().nonnegative().max(999_999_999_999.99),
});

export const createPriceListSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    tierId: z.string().uuid(),
    currency: currencySchema,
    isActive: z.boolean().default(true),
    items: z.array(priceListItemInputSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const scopes = new Set<string>();
    value.items.forEach((item, index) => {
      const scope = `${item.productId}:${item.variantId ?? "product"}`;
      if (scopes.has(scope)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Overlapping price rule for this product and variant scope",
        });
      }
      scopes.add(scope);
    });
  });

export const priceListQuerySchema = z.object({
  tierId: z.string().uuid().optional(),
  currency: currencySchema.optional(),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export const resolvePriceQuerySchema = z.object({
  customerTierId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  currency: currencySchema,
});

export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export type PriceListQuery = z.infer<typeof priceListQuerySchema>;
export type ResolvePriceInput = z.infer<typeof resolvePriceQuerySchema>;
