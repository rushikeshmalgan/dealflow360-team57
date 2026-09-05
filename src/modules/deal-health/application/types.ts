import type { DealHealthAlertType, DealHealthSeverity } from "../domain/types";

export type DealHealthAlertStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export type DealHealthAlertDto = {
  id: string;
  quotationId: string;
  quotationCode: string;
  customerId: string;
  customerName: string;
  salesRepId: string;
  type: DealHealthAlertType;
  status: DealHealthAlertStatus;
  severity: DealHealthSeverity;
  priorityScore: number;
  dealValue: string;
  details: unknown;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Per-quotation rollup for the UI's healthy/warning/critical indicator. */
export type DealHealthStatus = "healthy" | "warning" | "critical";

export type DealHealthSummaryDto = {
  quotationId: string;
  status: DealHealthStatus;
  alerts: DealHealthAlertDto[];
  evaluatedAt: string;
};

/** Everything one evaluation pass needs for a single quotation, pre-joined by the repository so
 * the service stays free of Prisma. */
export type QuotationHealthSnapshot = {
  id: string;
  code: string;
  status: string;
  salesRepId: string;
  customerId: string;
  customerName: string;
  createdAt: Date;
  /** Proxy for "last business activity" — see domain/rules/stalled-quotation.ts. */
  lastActivityAt: Date;
  /** Total net-before-tax value across lines — the "deal value" input to the priority score. */
  dealValue: number;
  /** Value-weighted effective discount across lines (0-100). Null when the quote has no lines. */
  currentDiscountPct: number | null;
  latestRisk: { score: number; band: "LOW" | "MEDIUM" | "HIGH" } | null;
  /** Oldest still-PENDING FINANCE_OPS approval step's createdAt, on the latest version. */
  pendingFinanceApprovalSince: Date | null;
  /** Present only when both a promised date and a current ship estimate exist. */
  delivery: { promisedDate: Date; currentEstimateDate: Date } | null;
};

export type DealHealthListQuery = {
  status?: DealHealthAlertStatus;
  type?: DealHealthAlertType;
  severity?: DealHealthSeverity;
  /** Repo-scoping filter; the service sets this to the actor's own id for a SALES_REP and
   * leaves it undefined (org-wide) for internal roles, never trusting a caller-supplied value. */
  salesRepId?: string;
  limit?: number;
};

export type EvaluateBatchResult = {
  evaluated: number;
  openAlerts: number;
};
