export type QuotationLineDto = {
  id: string;
  /** categoryId is included so T7.2's submit flow can resolve each line's discount ceiling
   * (DiscountRuleService.resolveCeiling needs tierId + categoryId) without a second query. */
  product: { id: string; name: string; sku: string; categoryId: string };
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

export type QuotationStatus =
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

export type QuotationDto = {
  id: string;
  code: string;
  seqNo: number;
  customer: { id: string; name: string; tierId: string };
  salesRep: { id: string; email: string };
  priceList: { id: string; name: string; currency: string };
  status: QuotationStatus;
  orderDiscountPct: string;
  version: number;
  lines: QuotationLineDto[];
  summary: QuotationSummaryDto;
  createdAt: string;
  updatedAt: string;
};

/** T7.1's output, persisted verbatim (as risk_evaluations.explanation JSONB) by T7.2's submit flow. */
export type QuotationRiskDto = {
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  configVersion: number;
  explanation: unknown;
};

export type QuotationApprovalStepDto = {
  stepOrder: number;
  role: "MANAGER" | "FINANCE_OPS";
};

/** T7.2 (POST /api/quotations/{id}/submit) response: the quotation after its status transition,
 * plus the risk result and approval chain that decided it — the client needs both to show the
 * "flagged, routed to approval" banner immediately, without a second round trip. */
export type SubmitQuotationResult = {
  quotation: QuotationDto;
  requiresApproval: boolean;
  risk: QuotationRiskDto;
  approvalSteps: QuotationApprovalStepDto[];
};
