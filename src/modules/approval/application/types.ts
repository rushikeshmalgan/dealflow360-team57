export type ApprovalStepDto = {
  id: string;
  stepOrder: number;
  role: "MANAGER" | "FINANCE_OPS";
};

export type ApprovalRuleDto = {
  id: string;
  riskBand: "LOW" | "MEDIUM" | "HIGH";
  isActive: boolean;
  steps: ApprovalStepDto[];
  createdAt: string;
  updatedAt: string;
};

/** One row in a Manager/Finance's "Pending Approvals" queue (T8.2/T8.3) — the ApprovalRecord
 * plus just enough quotation context to decide on it without a second round trip. */
export type ApprovalQueueItemDto = {
  id: string;
  stepOrder: number;
  role: "MANAGER" | "FINANCE_OPS";
  status: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED";
  version: number;
  /** True only for the first still-PENDING step on this quotation version — TAD's "only the
   * first pending step is actionable." A later step renders read-only until this is true. */
  isActionable: boolean;
  quotation: {
    id: string;
    code: string;
    status: string;
    customer: { id: string; name: string };
    salesRep: { id: string; email: string };
    netBeforeTax: string;
  };
  riskBand: "LOW" | "MEDIUM" | "HIGH";
  riskScore: string;
  createdAt: string;
};
