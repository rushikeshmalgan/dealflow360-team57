import { z } from "zod";

import {
  DEFAULT_CANCELLATION_RULE,
  DEFAULT_PARTIAL_REFUND_RULE,
  DEFAULT_PRORATION_RULE,
  SUBSCRIPTION_CADENCES,
} from "../domain/cadence";

export const ruleConfigSchema = z.record(z.string(), z.unknown());

export const createPlanSchema = z.object({
  name: z.string().trim().min(1, "Plan name is required").max(200),
  cadence: z.enum(SUBSCRIPTION_CADENCES, {
    message: "Cadence must be MONTHLY, QUARTERLY, or YEARLY",
  }),
  productId: z.string().uuid("Product ID must be a valid UUID").nullable().optional().default(null),
  prorationRule: ruleConfigSchema.default(DEFAULT_PRORATION_RULE),
  cancellationRule: ruleConfigSchema.default(DEFAULT_CANCELLATION_RULE),
  partialRefundRule: ruleConfigSchema.default(DEFAULT_PARTIAL_REFUND_RULE),
  isActive: z.boolean().default(true),
});

export const updatePlanSchema = z.object({
  name: z.string().trim().min(1, "Plan name is required").max(200).optional(),
  cadence: z
    .enum(SUBSCRIPTION_CADENCES, {
      message: "Cadence must be MONTHLY, QUARTERLY, or YEARLY",
    })
    .optional(),
  productId: z.string().uuid("Product ID must be a valid UUID").nullable().optional(),
  prorationRule: ruleConfigSchema.optional(),
  cancellationRule: ruleConfigSchema.optional(),
  partialRefundRule: ruleConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

export const planListQuerySchema = z.object({
  cadence: z.enum(SUBSCRIPTION_CADENCES).optional(),
  productId: z.string().uuid().optional(),
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type CreatePlanInput = z.input<typeof createPlanSchema>;
export type CreatePlanOutput = z.output<typeof createPlanSchema>;
export type UpdatePlanInput = z.input<typeof updatePlanSchema>;
export type UpdatePlanOutput = z.output<typeof updatePlanSchema>;
export type PlanListQuery = z.infer<typeof planListQuerySchema>;
