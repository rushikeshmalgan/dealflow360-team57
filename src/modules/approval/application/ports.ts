import type { Actor } from "@/modules/shared/domain/actor";

import type { ApprovalDecisionInput } from "../schemas/approval-decision";
import type { ApprovalRuleQuery, CreateApprovalRuleInput, UpdateApprovalRuleInput } from "../schemas/approval-rule";
import type { ApprovalQueueItemDto, ApprovalRuleDto } from "./types";

export interface ApprovalRuleRepository {
  list(query: ApprovalRuleQuery): Promise<ApprovalRuleDto[]>;
  get(id: string): Promise<ApprovalRuleDto | null>;
  create(input: CreateApprovalRuleInput, actor: Actor): Promise<ApprovalRuleDto>;
  update(id: string, input: UpdateApprovalRuleInput, actor: Actor): Promise<ApprovalRuleDto | null>;
  delete(id: string, actor: Actor): Promise<boolean>;
}

export interface ApprovalRecordRepository {
  /** Pending steps scoped to the actor's own role (ADMIN sees every role's queue). */
  listQueue(actor: Actor): Promise<ApprovalQueueItemDto[]>;
  decide(actor: Actor, recordId: string, input: ApprovalDecisionInput): Promise<ApprovalQueueItemDto>;
}
