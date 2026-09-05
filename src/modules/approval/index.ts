import { ApprovalRuleService } from "./application/approval-rule-service";
import { PrismaApprovalRuleRepository } from "./infrastructure/prisma-approval-rule-repository";

export const approvalRuleService = new ApprovalRuleService(new PrismaApprovalRuleRepository());

export { ApprovalRuleService } from "./application/approval-rule-service";
export type { ApprovalRuleDto, ApprovalStepDto } from "./application/types";
