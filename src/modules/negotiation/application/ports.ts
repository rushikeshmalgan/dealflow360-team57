import type {
  PortalConfirmResultDto,
  PortalQuotationDetailDto,
  PortalQuotationListItemDto,
} from "@/modules/portal/application/types";
import type { Actor } from "@/modules/shared/domain/actor";

import type { NegotiateQuotationInput } from "../schemas/negotiation";
import type { ResolveNegotiationInput } from "../schemas/resolve";
import type { PendingNegotiationDto, ResolveNegotiationResultDto } from "./types";

/** Every method takes the already-authorized (requireCustomer-narrowed) actor and scopes its
 * query on `actor.customerId` itself — the repository never receives a bare customerId string
 * from a caller, so there is no path that skips the ownership scope by accident. */
export interface NegotiationRepository {
  listPortalQuotations(actor: Actor & { customerId: string }): Promise<PortalQuotationListItemDto[]>;

  /** Returns null when the quotation doesn't exist, isn't owned by this customer, or isn't in
   * a customer-visible status — all three collapse to the same NOT_FOUND from the service, so
   * a caller can never distinguish "wrong id" from "someone else's quotation" from the response. */
  getPortalQuotation(
    actor: Actor & { customerId: string },
    id: string,
  ): Promise<PortalQuotationDetailDto | null>;

  negotiate(
    actor: Actor & { customerId: string },
    id: string,
    input: NegotiateQuotationInput,
  ): Promise<PortalQuotationDetailDto>;

  confirm(
    actor: Actor & { customerId: string },
    id: string,
  ): Promise<{ result: PortalConfirmResultDto; quotation: PortalQuotationDetailDto }>;
}

/** Internal (sales-rep/manager) counterpart to NegotiationRepository above — resolves the
 * dead-end where a customer's negotiation, once submitted, previously had no way to ever be
 * acted on from either side. Scopes on quotation ownership (SALES_REP: only their own; MANAGER/
 * ADMIN: any), never on customerId. */
export interface InternalNegotiationRepository {
  getPendingNegotiation(actor: Actor, quotationId: string): Promise<PendingNegotiationDto | null>;
  resolve(
    actor: Actor,
    quotationId: string,
    negotiationId: string,
    input: ResolveNegotiationInput,
  ): Promise<ResolveNegotiationResultDto>;
}
