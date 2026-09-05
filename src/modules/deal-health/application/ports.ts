import type { DealHealthAlertType, DealHealthSeverity } from "../domain/types";
import type { DealHealthAlertDto, DealHealthListQuery, QuotationHealthSnapshot } from "./types";

export type UpsertAlertInput = {
  quotationId: string;
  type: DealHealthAlertType;
  severity: DealHealthSeverity;
  priorityScore: number;
  dealValue: number;
  details: Record<string, unknown>;
  now: Date;
};

export type AlertWriteResult = {
  alert: DealHealthAlertDto;
  /** True only when this write is worth telling clients about: a brand-new alert, a reopened
   * one, or an OPEN alert whose severity/priorityScore actually moved - never a same-conditions
   * re-affirmation from a routine scheduled pass. Drives whether the service emits
   * `deal-health:updated` (TAD SS34: "after health state is committed"). */
  changed: boolean;
};

export interface DealHealthRepository {
  /** Bounded batch of quotations still eligible for evaluation (TAD SS34: active, non-terminal),
   * oldest-evaluated-first so repeated scheduled passes eventually cover the whole active set. */
  listActiveQuotationIds(limit: number): Promise<string[]>;

  getSnapshot(quotationId: string): Promise<QuotationHealthSnapshot | null>;

  /** The rep's other quotations' current effective discount, most recent first, bounded to
   * `limit`, excluding `quotationId` itself. */
  getRepDiscountHistory(salesRepId: string, quotationId: string, limit: number): Promise<number[]>;

  /**
   * Creates or refreshes the one alert row for (quotationId, type). Idempotent by construction
   * (DealHealthAlert's compound unique constraint + a DB upsert) - a duplicate evaluation, or a
   * BullMQ retry, converges on the same row rather than creating a second one. Leaves an
   * existing DISMISSED alert untouched while its condition is still active (sticky dismissal).
   */
  upsertOpenAlert(input: UpsertAlertInput): Promise<AlertWriteResult>;

  /** Marks the (quotationId, type) alert RESOLVED if it's currently OPEN; a no-op otherwise
   * (already resolved, dismissed, or never existed). */
  resolveAlertIfOpen(quotationId: string, type: DealHealthAlertType): Promise<AlertWriteResult | null>;

  listAlerts(query: DealHealthListQuery): Promise<DealHealthAlertDto[]>;

  getAlertsForQuotation(quotationId: string): Promise<DealHealthAlertDto[]>;

  /** For authorization: which quotation (and its owning sales rep) an alert belongs to. */
  getAlertOwnership(alertId: string): Promise<{ quotationId: string; salesRepId: string } | null>;

  dismissAlert(alertId: string, resolvedByUserId: string, now: Date): Promise<DealHealthAlertDto | null>;
}
