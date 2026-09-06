import type { Actor } from "@/modules/shared/domain/actor";
import { requireRole } from "@/modules/shared/domain/actor";

import type { ResolveNegotiationInput } from "../schemas/resolve";
import type { InternalNegotiationRepository } from "./ports";

/**
 * Internal counterpart to NegotiationService: lets a Sales Rep (or Manager/Admin overseeing the
 * pipeline) act on a customer's pending negotiation. Fixes the dead-end the P0 audit found —
 * NegotiationService.negotiate()/confirm() had no matching "resolve" anywhere, so a submitted
 * counter-discount or change request could never be accepted or declined by anyone.
 */
export class NegotiationResolutionService {
  constructor(private readonly repository: InternalNegotiationRepository) {}

  async getPending(actor: Actor | null, quotationId: string) {
    requireRole(actor, ["SALES_REP", "MANAGER", "ADMIN"]);
    return this.repository.getPendingNegotiation(actor, quotationId);
  }

  async resolve(
    actor: Actor | null,
    quotationId: string,
    negotiationId: string,
    input: ResolveNegotiationInput,
  ) {
    requireRole(actor, ["SALES_REP", "MANAGER", "ADMIN"]);
    return this.repository.resolve(actor, quotationId, negotiationId, input);
  }
}
