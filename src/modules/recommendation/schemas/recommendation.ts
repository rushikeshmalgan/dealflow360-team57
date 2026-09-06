import { z } from "zod";

const uuid = z.string().uuid();
const positiveInt = z.coerce.number().int().positive();

export const generateRecommendationsSchema = z.object({
  quotationId: uuid,
});

export const addRecommendationToQuoteSchema = z.object({
  expectedVersion: positiveInt,
});

export type GenerateRecommendationsInput = z.infer<typeof generateRecommendationsSchema>;
export type AddRecommendationToQuoteInput = z.infer<typeof addRecommendationToQuoteSchema>;
