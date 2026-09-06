import { z } from "zod";

/**
 * ADMIN-only account creation (TAD-equivalent: "admin can add role-based login"). This is the
 * only place a non-CUSTOMER role can ever be granted — the self-service /api/auth/login path
 * (src/lib/auth/login.ts) can only ever create CUSTOMER accounts.
 */
export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(4).max(200),
    role: z.enum(["ADMIN", "SALES_REP", "MANAGER", "FINANCE_OPS", "CUSTOMER"]),
    customerId: z.string().uuid().nullable().optional(),
  })
  .refine((input) => input.role !== "CUSTOMER" || !!input.customerId, {
    message: "customerId is required when role is CUSTOMER",
    path: ["customerId"],
  });

export const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "SALES_REP", "MANAGER", "FINANCE_OPS", "CUSTOMER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(4).max(200).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
