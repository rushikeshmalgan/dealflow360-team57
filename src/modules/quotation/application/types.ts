export type QuotationLineDto = {
  id: string;
  product: { id: string; name: string; sku: string };
  variant: { id: string; attribute: string; value: string } | null;
  quantity: number;
  unitPrice: string;
  lineDiscountPct: string;
  billingType: "ONE_TIME" | "RECURRING";
  /** T6.4/T6.5: always recomputed live from current price/quantity/discount, never persisted. */
  effectiveDiscountPct: string;
  netBeforeTax: string;
  marginAmount: string;
  marginPct: string | null;
  createdAt: string;
  updatedAt: string;
};

/** T6.5's live totals + margin, recomputed on every read via T6.4's pure function. */
export type QuotationSummaryDto = {
  netBeforeTax: string;
  totalCost: string;
  marginAmount: string;
  marginPct: string | null;
};

export type QuotationDto = {
  id: string;
  code: string;
  seqNo: number;
  customer: { id: string; name: string; tierId: string };
  salesRep: { id: string; email: string };
  priceList: { id: string; name: string; currency: string };
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "SENT_TO_CUSTOMER"
    | "UNDER_NEGOTIATION"
    | "RE_APPROVAL_REQUIRED"
    | "CONFIRMED"
    | "FULFILLMENT"
    | "BILLING"
    | "COMPLETED";
  orderDiscountPct: string;
  version: number;
  lines: QuotationLineDto[];
  summary: QuotationSummaryDto;
  createdAt: string;
  updatedAt: string;
};
