import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireCustomer } from "@/modules/shared/domain/actor";

import type { NegotiateQuotationInput } from "../schemas/negotiation";
import type { NegotiationRepository } from "./ports";

/**
 * The customer portal's application service. Every method starts with `requireCustomer`
 * (TAD-equivalent: the portal is a separate, restricted security context) — a SALES_REP,
 * MANAGER, FINANCE_OPS, or ADMIN actor is rejected here just as firmly as an unauthenticated
 * one, before any repository query runs. Ownership beyond "is this actor a customer at all" is
 * enforced by the repository, which scopes every query on `actor.customerId` directly rather
 * than fetching a row and checking it afterward.
 */
export class NegotiationService {
  constructor(private readonly repository: NegotiationRepository) {}

  list(actor: Actor | null) {
    requireCustomer(actor);
    return this.repository.listPortalQuotations(actor);
  }

  async get(actor: Actor | null, id: string) {
    requireCustomer(actor);
    const quotation = await this.repository.getPortalQuotation(actor, id);
    if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id });
    return quotation;
  }

  negotiate(actor: Actor | null, id: string, input: NegotiateQuotationInput) {
    requireCustomer(actor);
    return this.repository.negotiate(actor, id, input);
  }

  confirm(actor: Actor | null, id: string) {
    requireCustomer(actor);
    return this.repository.confirm(actor, id);
  }
}
