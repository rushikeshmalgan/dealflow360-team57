import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  tierId: z.string().uuid(),
  primaryContactEmail: z.string().trim().email().max(320).nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
