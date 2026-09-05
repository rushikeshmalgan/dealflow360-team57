import type { Actor } from "@/modules/shared/domain/actor";
import { requireInternal, requireRole } from "@/modules/shared/domain/actor";

import type { CreateInvoiceInput, InvoiceListQuery, RecordPaymentInput } from "../schemas/invoice";
import type { InvoiceRepository } from "./ports";

/**
 * TAD SS6 role matrix, "Manage billing and record payment": Finance/Ops is the only role with
 * default write access — Sales Rep gets Track (read), Manager gets Read, Admin has no default
 * access. Unlike catalog/customer config (requireAdmin), billing writes deliberately do not
 * fall back to Admin.
 */
const BILLING_WRITE_ROLES = ["FINANCE_OPS"] as const;

export class InvoiceService {
  constructor(private readonly repository: InvoiceRepository) {}

  list(actor: Actor | null, query: InvoiceListQuery = {}) {
    requireInternal(actor);
    return this.repository.list(query);
  }

  get(actor: Actor | null, id: string) {
    requireInternal(actor);
    return this.repository.get(id);
  }

  create(actor: Actor | null, input: CreateInvoiceInput) {
    requireRole(actor, BILLING_WRITE_ROLES);
    return this.repository.create(input, actor);
  }

  recordPayment(actor: Actor | null, id: string, input: RecordPaymentInput) {
    requireRole(actor, BILLING_WRITE_ROLES);
    return this.repository.recordPayment(id, input, actor);
  }
}
