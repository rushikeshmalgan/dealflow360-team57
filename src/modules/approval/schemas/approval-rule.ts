import { z } from "zod";

const reasonSchema = z.string().trim().min(1).max(1_000).optional();

export const riskBandSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const approverRoleSchema = z.enum(["MANAGER", "FINANCE_OPS"]);

export const approvalStepInputSchema = z.object({
  stepOrder: z.coerce.number().int().min(1).max(20),
  role: approverRoleSchema,
});

/**
 * TAD SS11: LOW -> no approval, MEDIUM -> manager, HIGH -> manager then Finance.
 * Structural validation only (contiguous ordering, no duplicates, Finance never
 * precedes Manager) — this is what T3.2's DoD calls "overlapping or gapped range".
 * The exact LOW/MEDIUM/HIGH step counts stay admin-configurable; T8.1 is the only
 * downstream reader of this shape and must not embed its own copy of these rules.
 */
const approvalStepsSchema = z.array(approvalStepInputSchema).max(10).superRefine((steps, ctx) => {
  const seen = new Set<number>();
  steps.forEach((step, index) => {
    if (seen.has(step.stepOrder)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "stepOrder"],
        message: `Overlapping approval step: step order ${step.stepOrder} is already used by another step`,
      });
    }
    seen.add(step.stepOrder);
  });

  const orders = [...seen].sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i += 1) {
    if (orders[i] !== i + 1) {
      ctx.addIssue({
        code: "custom",
        path: ["steps"],
        message: `Gapped approval chain: step order must be contiguous starting at 1 (missing step ${i + 1})`,
      });
      break;
    }
  }

  const managerOrders = steps.filter((step) => step.role === "MANAGER").map((step) => step.stepOrder);
  const financeOrders = steps.filter((step) => step.role === "FINANCE_OPS").map((step) => step.stepOrder);
  if (managerOrders.length && financeOrders.length && Math.min(...financeOrders) < Math.max(...managerOrders)) {
    ctx.addIssue({
      code: "custom",
      path: ["steps"],
      message: "A Finance step cannot precede a Manager step in the approval chain",
    });
  }
});

export const createApprovalRuleSchema = z.object({
  riskBand: riskBandSchema,
  isActive: z.boolean().default(true),
  steps: approvalStepsSchema.default([]),
  reason: reasonSchema,
});

// riskBand is immutable after creation — recreate the rule to retarget it.
export const updateApprovalRuleSchema = z.object({
  isActive: z.boolean().optional(),
  steps: approvalStepsSchema.optional(),
  reason: reasonSchema,
});

export const approvalRuleQuerySchema = z.object({
  riskBand: riskBandSchema.optional(),
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type ApprovalStepInput = z.infer<typeof approvalStepInputSchema>;
export type CreateApprovalRuleInput = z.infer<typeof createApprovalRuleSchema>;
export type UpdateApprovalRuleInput = z.infer<typeof updateApprovalRuleSchema>;
export type ApprovalRuleQuery = z.infer<typeof approvalRuleQuerySchema>;
