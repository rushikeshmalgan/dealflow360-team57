import type { Actor } from "@/modules/shared/domain/actor";

import type { ApprovalRuleQuery, CreateApprovalRuleInput, UpdateApprovalRuleInput } from "../schemas/approval-rule";
import type { ApprovalRuleDto } from "./types";

export interface ApprovalRuleRepository {
  list(query: ApprovalRuleQuery): Promise<ApprovalRuleDto[]>;
  get(id: string): Promise<ApprovalRuleDto | null>;
  create(input: CreateApprovalRuleInput, actor: Actor): Promise<ApprovalRuleDto>;
  update(id: string, input: UpdateApprovalRuleInput, actor: Actor): Promise<ApprovalRuleDto | null>;
  delete(id: string, actor: Actor): Promise<boolean>;
}
