import { z } from "zod";

export const createTierSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const updateTierSchema = createTierSchema.partial();

export type CreateTierInput = z.infer<typeof createTierSchema>;
export type UpdateTierInput = z.infer<typeof updateTierSchema>;
