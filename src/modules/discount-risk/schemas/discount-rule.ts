import { z } from "zod";

const percentage = z.coerce.number().finite().min(0).max(100);
const reasonSchema = z.string().trim().min(1).max(1_000).optional();

export const discountRuleScopeSchema = z.enum(["TIER", "CATEGORY"]);

export const createDiscountRuleSchema = z
  .object({
    scope: discountRuleScopeSchema,
    tierId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    maxDiscountPct: percentage,
    isActive: z.boolean().default(true),
    reason: reasonSchema,
  })
  .superRefine((value, ctx) => {
    if (value.scope === "TIER") {
      if (!value.tierId) {
        ctx.addIssue({ code: "custom", path: ["tierId"], message: "tierId is required when scope is TIER" });
      }
      if (value.categoryId) {
        ctx.addIssue({
          code: "custom",
          path: ["categoryId"],
          message: "categoryId must not be set when scope is TIER",
        });
      }
    } else {
      if (!value.categoryId) {
        ctx.addIssue({
          code: "custom",
          path: ["categoryId"],
          message: "categoryId is required when scope is CATEGORY",
        });
      }
      if (value.tierId) {
        ctx.addIssue({ code: "custom", path: ["tierId"], message: "tierId must not be set when scope is CATEGORY" });
      }
    }
  });

// scope/tierId/categoryId are immutable after creation — recreate the rule to retarget it.
export const updateDiscountRuleSchema = z.object({
  maxDiscountPct: percentage.optional(),
  isActive: z.boolean().optional(),
  reason: reasonSchema,
});

export const discountRuleQuerySchema = z.object({
  scope: discountRuleScopeSchema.optional(),
  tierId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const resolveCeilingQuerySchema = z.object({
  tierId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
});

export type CreateDiscountRuleInput = z.infer<typeof createDiscountRuleSchema>;
export type UpdateDiscountRuleInput = z.infer<typeof updateDiscountRuleSchema>;
export type DiscountRuleQuery = z.infer<typeof discountRuleQuerySchema>;
export type ResolveCeilingQuery = z.infer<typeof resolveCeilingQuerySchema>;
