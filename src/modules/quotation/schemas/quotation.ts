import { z } from "zod";

const percentage = z.coerce.number().finite().min(0).max(100);
const positiveInt = z.coerce.number().int().positive();
const uuid = z.string().uuid();

export const quotationStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "SENT_TO_CUSTOMER",
  "UNDER_NEGOTIATION",
  "RE_APPROVAL_REQUIRED",
  "CONFIRMED",
  "FULFILLMENT",
  "BILLING",
  "COMPLETED",
]);

export const billingTypeSchema = z.enum(["ONE_TIME", "RECURRING"]);

export const createQuotationSchema = z.object({
  customerId: uuid,
  priceListId: uuid,
});

export const quotationListQuerySchema = z.object({
  status: quotationStatusSchema.optional(),
  customerId: uuid.optional(),
  /** MANAGER/FINANCE_OPS/ADMIN only — a SALES_REP is always scoped to their own quotations. */
  salesRepId: uuid.optional(),
});

export const addQuotationLineSchema = z.object({
  expectedVersion: positiveInt,
  productId: uuid,
  variantId: uuid.nullable().optional(),
  quantity: positiveInt,
  billingType: billingTypeSchema.default("ONE_TIME"),
});

// PATCH /api/quotations/{id}: the Quotation aggregate root accepts exactly one line-level
// command per call (TAD SS9 aggregate-root pattern) alongside the expectedVersion required by
// every mutation (TAD SS26). Discount changes go through the dedicated /discounts endpoint (T6.4).
export const patchQuotationSchema = z
  .object({
    expectedVersion: positiveInt,
    removeLineId: uuid.optional(),
    updateLineQuantity: z
      .object({
        lineId: uuid,
        quantity: positiveInt,
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const commandCount = [value.removeLineId, value.updateLineQuantity].filter(
      (v) => v !== undefined,
    ).length;
    if (commandCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Specify exactly one of removeLineId or updateLineQuantity",
      });
    }
  });

export const lineDiscountInputSchema = z.object({
  lineId: uuid,
  lineDiscountPct: percentage,
});

export const updateQuotationDiscountsSchema = z
  .object({
    expectedVersion: positiveInt,
    orderDiscountPct: percentage.optional(),
    lineDiscounts: z.array(lineDiscountInputSchema).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.orderDiscountPct === undefined && value.lineDiscounts === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Specify at least one of orderDiscountPct or lineDiscounts",
      });
    }
  });

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type QuotationListQuery = z.infer<typeof quotationListQuerySchema>;
export type AddQuotationLineInput = z.infer<typeof addQuotationLineSchema>;
export type PatchQuotationInput = z.infer<typeof patchQuotationSchema>;
export type UpdateQuotationDiscountsInput = z.infer<typeof updateQuotationDiscountsSchema>;
