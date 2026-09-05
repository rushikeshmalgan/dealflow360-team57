import { z } from "zod";

export const invoiceLineInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().finite().nonnegative().max(999_999_999_999.99),
});

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be an ISO-style three-letter code"));

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  quotationId: z.string().uuid().nullable().optional(),
  currency: currencySchema.default("USD"),
  dueDate: z.coerce.date().nullable().optional(),
  lines: z.array(invoiceLineInputSchema).min(1),
});

export const invoiceStatusSchema = z.enum([
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
  "CREDITED",
]);

export const invoiceListQuerySchema = z.object({
  status: invoiceStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().finite().positive().max(999_999_999_999.99),
  method: z.string().trim().max(100).optional(),
  reference: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
