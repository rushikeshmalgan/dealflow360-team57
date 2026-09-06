/** Internal (sales-rep/manager) view of a pending negotiation — same underlying data the
 * portal DTO shows the customer, without the customer-facing field stripping. */
export type PendingNegotiationDto = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
  counterDiscountPct: string | null;
  requestedDeliveryDate: string | null;
  generalComment: string | null;
  lineComments: { id: string; lineId: string | null; comment: string; createdAt: string }[];
  changeRequests: {
    id: string;
    lineId: string | null;
    requestType: string;
    note: string | null;
    status: string;
  }[];
  createdAt: string;
};

export type ResolveNegotiationResultDto = {
  negotiation: PendingNegotiationDto;
  quotationId: string;
  quotationStatus: string;
  quotationVersion: number;
};
