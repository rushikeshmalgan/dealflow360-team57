import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { ApprovalRuleQuery, CreateApprovalRuleInput, UpdateApprovalRuleInput } from "../schemas/approval-rule";
import type { ApprovalRuleRepository } from "./ports";

export class ApprovalRuleService {
  constructor(private readonly repository: ApprovalRuleRepository) {}

  list(actor: Actor | null, query: ApprovalRuleQuery = {}) {
    requireInternal(actor);
    return this.repository.list(query);
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const rule = await this.repository.get(id);
    if (!rule) throw new ServiceError("NOT_FOUND", "Approval rule not found", { id });
    return rule;
  }

  create(actor: Actor | null, input: CreateApprovalRuleInput) {
    requireAdmin(actor);
    return this.repository.create(input, actor);
  }

  async update(actor: Actor | null, id: string, input: UpdateApprovalRuleInput) {
    requireAdmin(actor);
    const rule = await this.repository.update(id, input, actor);
    if (!rule) throw new ServiceError("NOT_FOUND", "Approval rule not found", { id });
    return rule;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id, actor))) {
      throw new ServiceError("NOT_FOUND", "Approval rule not found", { id });
    }
  }
}
