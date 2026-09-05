import { z } from "zod";

import { SUBSCRIPTION_CADENCES } from "../domain/cadence";

export const createSubscriptionSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  cycle: z.enum(SUBSCRIPTION_CADENCES),
  startDate: z.string().datetime().optional(),
  quotationId: z.string().uuid().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().length(3).default("USD").optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const createBillingPlanFromQuotationSchema = z.object({
  quotationId: z.string().uuid(),
});

export type CreateBillingPlanFromQuotationInput = z.infer<
  typeof createBillingPlanFromQuotationSchema
>;

export const modifySubscriptionSchema = z.object({
  planId: z.string().uuid().optional(),
  cycle: z.enum(SUBSCRIPTION_CADENCES).optional(),
  amount: z.number().nonnegative().optional(),
  effectiveDate: z.string().datetime().optional(),
  expectedVersion: z.number().int().positive(),
});

export type ModifySubscriptionInput = z.infer<typeof modifySubscriptionSchema>;

export const cancelSubscriptionSchema = z.object({
  reason: z.string().optional(),
  immediate: z.boolean().default(true).optional(),
  cancelDate: z.string().datetime().optional(),
  expectedVersion: z.number().int().positive(),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;

export const subscriptionListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  customerId: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
});

export type SubscriptionListQuery = z.infer<typeof subscriptionListQuerySchema>;
