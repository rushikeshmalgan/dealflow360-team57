import type { Actor } from "@/modules/shared/domain/actor";
import { requireRole } from "@/modules/shared/domain/actor";

import type { ApprovalDecisionInput } from "../schemas/approval-decision";
import type { ApprovalRecordRepository } from "./ports";

/**
 * T8.2/T8.3 — the piece the P0 audit found completely missing: once T8.1 creates ApprovalRecord
 * rows on submit, this is the only code path that ever lets a Manager/Finance Ops user act on
 * them (approve/reject/return). Without it a quotation reaches PENDING_APPROVAL and can never
 * leave — there was no other endpoint in the app that ever set ApprovalRecord.status away from
 * PENDING.
 */
export class ApprovalRecordService {
  constructor(private readonly repository: ApprovalRecordRepository) {}

  listQueue(actor: Actor | null) {
    requireRole(actor, ["MANAGER", "FINANCE_OPS", "ADMIN"]);
    return this.repository.listQueue(actor);
  }

  decide(actor: Actor | null, recordId: string, input: ApprovalDecisionInput) {
    requireRole(actor, ["MANAGER", "FINANCE_OPS", "ADMIN"]);
    return this.repository.decide(actor, recordId, input);
  }
}
