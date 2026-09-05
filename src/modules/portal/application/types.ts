/**
 * Customer Portal Negotiation — DTO contract.
 *
 * Backed for real by `src/modules/negotiation/*` (application/infrastructure) and served over:
 *   GET  /api/portal/quotations                 -> PortalQuotationListItemDto[]
 *   GET  /api/portal/quotations/{id}            -> PortalQuotationDetailDto
 *   POST /api/portal/quotations/{id}/negotiate  (body: PortalNegotiationRequestInput) -> PortalQuotationDetailDto
 *   POST /api/portal/quotations/{id}/confirm    (no body) -> PortalConfirmResultDto
 *
 * These map 1:1 to the endpoints documented in docs/API_DOCS.md §7 ("Customer Portal —
 * Screen 11"), translated from that doc's illustrative snake_case/`/api/v1` sketch into this
 * codebase's actual camelCase DTO + `/api/...` route convention (see other modules under
 * src/modules/*). Every field here is customer-safe: no margin, cost, risk score, approval
 * chain/comments, inventory, or other-customer data — `PrismaNegotiationRepository` never
 * selects those columns in the first place, so there is nothing to accidentally leak.
 *
 * The UI (src/app/portal/**) fetches these via the shared `apiRequest` helper, exactly like
 * every other module's pages — there is no separate portal-specific client.
 */

export type PortalQuotationStatus =
  | "SENT_TO_CUSTOMER"
  | "UNDER_NEGOTIATION"
  | "RE_APPROVAL_REQUIRED"
  | "CONFIRMED"
  | "COMPLETED";

export type PortalNegotiationStatus = "NONE" | "PENDING" | "ACCEPTED" | "REJECTED";

export type PortalCommentAuthor = "CUSTOMER" | "SALES";

export type PortalCommentDto = {
  id: string;
  author: PortalCommentAuthor;
  authorLabel: string;
  comment: string;
  createdAt: string;
};

export type PortalQuotationLineDto = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  /** Customer-visible discount already applied to this line — never the internal ceiling. */
  discountPct: string;
  lineTotal: string;
  comments: PortalCommentDto[];
};

export type PortalNegotiationHistoryEntryDto = {
  id: string;
  actor: PortalCommentAuthor;
  actorLabel: string;
  action: string;
  detail: string | null;
  createdAt: string;
};

export type PortalPendingNegotiationDto = {
  counterDiscountPct: string | null;
  requestedDeliveryDate: string | null;
  generalComment: string | null;
  submittedAt: string;
};

export type PortalQuotationListItemDto = {
  id: string;
  code: string;
  status: PortalQuotationStatus;
  negotiationStatus: PortalNegotiationStatus;
  total: string;
  updatedAt: string;
};

export type PortalQuotationDetailDto = {
  id: string;
  code: string;
  status: PortalQuotationStatus;
  validUntil: string | null;
  customerName: string;
  orderDiscountPct: string;
  orderTotal: string;
  lines: PortalQuotationLineDto[];
  negotiationStatus: PortalNegotiationStatus;
  pendingNegotiation: PortalPendingNegotiationDto | null;
  history: PortalNegotiationHistoryEntryDto[];
  updatedAt: string;
};

export type PortalLineCommentInput = {
  lineId: string;
  comment: string;
};

export type PortalChangeRequestInput = {
  lineId: string;
  requestType: "QUANTITY_CHANGE" | "REMOVE_LINE" | "OTHER";
  note: string;
};

export type PortalNegotiationRequestInput = {
  counterDiscountPct?: number;
  requestedDeliveryDate?: string;
  generalComment?: string;
  lineComments?: PortalLineCommentInput[];
  changeRequests?: PortalChangeRequestInput[];
};

export type PortalConfirmResultDto = {
  status: "CONFIRMED" | "PENDING_APPROVAL";
  reason?: string;
};
