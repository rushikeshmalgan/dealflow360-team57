import { z } from "zod";

export const approvalDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "RETURN"]),
  reason: z.string().trim().max(2000).optional(),
  expectedVersion: z.number().int().nonnegative(),
});

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
