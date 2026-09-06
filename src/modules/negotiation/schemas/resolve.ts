import { z } from "zod";

export const resolveNegotiationSchema = z.object({
  action: z.enum(["APPLY", "DECLINE"]),
  reason: z.string().trim().max(2000).optional(),
});

export type ResolveNegotiationInput = z.infer<typeof resolveNegotiationSchema>;
