import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).nullable().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
