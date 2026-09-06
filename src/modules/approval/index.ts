import { ApprovalRecordService } from "./application/approval-record-service";
import { ApprovalRuleService } from "./application/approval-rule-service";
import { PrismaApprovalRecordRepository } from "./infrastructure/prisma-approval-record-repository";
import { PrismaApprovalRuleRepository } from "./infrastructure/prisma-approval-rule-repository";

export const approvalRuleService = new ApprovalRuleService(new PrismaApprovalRuleRepository());
export const approvalRecordService = new ApprovalRecordService(new PrismaApprovalRecordRepository());

export { ApprovalRuleService } from "./application/approval-rule-service";
export { ApprovalRecordService } from "./application/approval-record-service";
export type { ApprovalRuleDto, ApprovalStepDto, ApprovalQueueItemDto } from "./application/types";
