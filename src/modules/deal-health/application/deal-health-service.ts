import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { enqueueOutboxEvent } from "@/jobs/outbox";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireInternal, requireRole } from "@/modules/shared/domain/actor";
import { emitRealtimeEvent } from "@/realtime/emit";
import { roomName } from "@/realtime/rooms";

import { DEAL_HEALTH_CONFIG_V1, type DealHealthConfig } from "../domain/config";
import { computePriorityScore } from "../domain/priority-score";
import { evaluateDeliverySlippage } from "../domain/rules/delivery-slippage";
import { evaluateDiscountAnomaly } from "../domain/rules/discount-anomaly";
import { evaluateHighRiskDeal } from "../domain/rules/high-risk-deal";
import { evaluateStalledQuotation } from "../domain/rules/stalled-quotation";
import {
  DEAL_HEALTH_ALERT_TYPES,
  DEAL_HEALTH_EVALUATE_EVENT,
  type DealHealthAlertType,
  type RuleFinding,
} from "../domain/types";
import type { DealHealthRepository } from "./ports";
import type {
  DealHealthAlertDto,
  DealHealthListQuery,
  DealHealthStatus,
  DealHealthSummaryDto,
  EvaluateBatchResult,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * TAD SS34: "manager role" is the event's room; broadened here to every internal role with a
 * legitimate interest in this deal - Admin (superset of Manager), Finance/Ops (owns the
 * approval this alert type can reference), and the deal's own Sales Rep - never a customer room.
 */
function dealHealthRooms(salesRepId: string): string[] {
  return [
    roomName("role", "MANAGER"),
    roomName("role", "ADMIN"),
    roomName("role", "FINANCE_OPS"),
    roomName("user", salesRepId),
  ];
}

function deriveStatus(alerts: readonly DealHealthAlertDto[]): DealHealthStatus {
  const open = alerts.filter((alert) => alert.status === "OPEN");
  if (open.length === 0) return "healthy";
  const hasSevere = open.some((alert) => alert.severity === "HIGH" || alert.severity === "CRITICAL");
  return hasSevere ? "critical" : "warning";
}

export class DealHealthService {
  constructor(
    private readonly repository: DealHealthRepository,
    private readonly config: DealHealthConfig = DEAL_HEALTH_CONFIG_V1,
  ) {}

  /**
   * Runs all four TAD SS34 rules for one quotation and persists the result. The single
   * evaluation implementation for both triggers - the scheduled batch pass calls this once per
   * quotation, and the on-demand refresh path (via the BullMQ worker) calls it for exactly one -
   * so there is never a second copy of the rule-orchestration logic to drift out of sync.
   */
  async evaluateQuotation(quotationId: string, now = new Date()): Promise<DealHealthSummaryDto | null> {
    const snapshot = await this.repository.getSnapshot(quotationId);
    if (!snapshot) return null;

    const ageDays = (now.getTime() - snapshot.createdAt.getTime()) / DAY_MS;

    const stalled = evaluateStalledQuotation(
      { status: snapshot.status, lastActivityAt: snapshot.lastActivityAt, now },
      this.config.stalled,
    );

    let discountAnomaly: RuleFinding | null = null;
    if (snapshot.currentDiscountPct !== null) {
      const history = await this.repository.getRepDiscountHistory(
        snapshot.salesRepId,
        snapshot.id,
        this.config.discountAnomaly.lookbackCount,
      );
      discountAnomaly = evaluateDiscountAnomaly(
        { currentDiscountPct: snapshot.currentDiscountPct, historicalDiscountPcts: history },
        this.config.discountAnomaly,
      );
    }

    const deliverySlippage = snapshot.delivery
      ? evaluateDeliverySlippage(snapshot.delivery, this.config.deliverySlippage)
      : null;

    // TAD SS34/§10: this feature never recomputes risk - `latestRisk` is read straight off the
    // already-persisted RiskEvaluation row that T7.1's scoreRisk produced at submit time.
    const highRiskDeal = evaluateHighRiskDeal(
      {
        riskBand: snapshot.latestRisk?.band ?? null,
        riskScore: snapshot.latestRisk?.score ?? null,
        pendingFinanceApprovalSince: snapshot.pendingFinanceApprovalSince,
        now,
      },
      this.config.highRiskDeal,
    );

    const findings: Record<DealHealthAlertType, RuleFinding | null> = {
      STALLED_QUOTATION: stalled,
      DISCOUNT_ANOMALY: discountAnomaly,
      DELIVERY_SLIPPAGE: deliverySlippage,
      HIGH_RISK_DEAL: highRiskDeal,
    };

    const rooms = dealHealthRooms(snapshot.salesRepId);

    for (const type of DEAL_HEALTH_ALERT_TYPES) {
      const finding = findings[type];
      if (finding) {
        const priorityScore = computePriorityScore(
          { severity: finding.severity, dealValue: snapshot.dealValue, ageDays },
          this.config.priorityScore,
        );
        const result = await this.repository.upsertOpenAlert({
          quotationId,
          type,
          severity: finding.severity,
          priorityScore,
          dealValue: snapshot.dealValue,
          details: finding.details,
          now,
        });
        if (result.changed) this.emitAlertUpdate(result.alert, rooms);
      } else {
        const result = await this.repository.resolveAlertIfOpen(quotationId, type);
        if (result?.changed) this.emitAlertUpdate(result.alert, rooms);
      }
    }

    const alerts = await this.repository.getAlertsForQuotation(quotationId);
    return { quotationId, status: deriveStatus(alerts), alerts, evaluatedAt: now.toISOString() };
  }

  /** Scheduled trigger (src/jobs/deal-health-scheduler.ts): evaluates a bounded batch of active
   * quotations, oldest-evaluated-first, so one slow tick never blocks the whole active set. */
  async evaluateBatch(limit = this.config.batchSize, now = new Date()): Promise<EvaluateBatchResult> {
    const ids = await this.repository.listActiveQuotationIds(limit);
    let openAlerts = 0;
    for (const id of ids) {
      const summary = await this.evaluateQuotation(id, now);
      if (summary) openAlerts += summary.alerts.filter((alert) => alert.status === "OPEN").length;
    }
    return { evaluated: ids.length, openAlerts };
  }

  private emitAlertUpdate(alert: DealHealthAlertDto, rooms: readonly string[]) {
    for (const room of rooms) {
      // TAD SS34's event table lists the payload as "alert id, type, priority" - the ER summary
      // names the same categorical column "priority", which this module calls `severity`
      // everywhere else; `priority` here is that label, not the numeric `priorityScore` (which
      // clients get from the REST refetch this event triggers, never from the realtime payload).
      emitRealtimeEvent(room, "deal-health:updated", {
        alertId: alert.id,
        type: alert.type,
        priority: alert.severity,
      });
    }
  }

  // ---- Read/authorization surface (TAD SS6: internal-only, Sales Rep scoped to own deals) ---

  async listAlerts(actor: Actor | null, query: DealHealthListQuery): Promise<DealHealthAlertDto[]> {
    requireInternal(actor);
    // "Managers should see appropriate team-scoped information" (no manager/team hierarchy
    // exists in this schema, so Manager/Admin/Finance see the full internal scope - the closest
    // honest approximation); a Sales Rep never sees another rep's alerts, matching how
    // QuotationService already scopes reads.
    const scoped = actor.role === "SALES_REP" ? { ...query, salesRepId: actor.id } : query;
    return this.repository.listAlerts(scoped);
  }

  async getQuotationHealth(actor: Actor | null, quotationId: string): Promise<DealHealthSummaryDto> {
    requireInternal(actor);
    const snapshot = await this.repository.getSnapshot(quotationId);
    if (!snapshot) throw new ServiceError("NOT_FOUND", "Quotation not found", { quotationId });
    if (actor.role === "SALES_REP" && actor.id !== snapshot.salesRepId) {
      throw new ServiceError("FORBIDDEN", "You do not have access to this quotation's deal health");
    }
    const alerts = await this.repository.getAlertsForQuotation(quotationId);
    return { quotationId, status: deriveStatus(alerts), alerts, evaluatedAt: new Date().toISOString() };
  }

  /**
   * On-demand refresh (TAD SS34): writes a durable outbox row rather than evaluating inline, so
   * a refresh click goes through the exact same BullMQ path (idempotent, retryable, Redis-outage
   * safe) as the scheduled evaluator - never a second, divergent code path. Each click gets its
   * own idempotency key (unlike a retried business request, a fresh "refresh" click is a new,
   * distinct user action that should always re-run, not collapse into a stale prior one);
   * running the evaluation twice is still safe because the alert upsert itself is idempotent.
   */
  async refreshQuotation(actor: Actor | null, quotationId: string): Promise<void> {
    requireInternal(actor);
    const snapshot = await this.repository.getSnapshot(quotationId);
    if (!snapshot) throw new ServiceError("NOT_FOUND", "Quotation not found", { quotationId });
    if (actor.role === "SALES_REP" && actor.id !== snapshot.salesRepId) {
      throw new ServiceError("FORBIDDEN", "You do not have access to this quotation's deal health");
    }
    await enqueueOutboxEvent(prisma, {
      eventType: DEAL_HEALTH_EVALUATE_EVENT,
      payload: { quotationId },
      idempotencyKey: `deal-health:manual:${quotationId}:${randomUUID()}`,
    });
  }

  /** Manager/Admin judgment call (TAD SS6: approval-style decisions are role-gated); dismissal
   * is sticky - the evaluator leaves a DISMISSED alert alone while its condition stays active. */
  async dismissAlert(actor: Actor | null, alertId: string, now = new Date()): Promise<DealHealthAlertDto> {
    requireRole(actor, ["ADMIN", "MANAGER"]);
    const ownership = await this.repository.getAlertOwnership(alertId);
    if (!ownership) throw new ServiceError("NOT_FOUND", "Alert not found", { alertId });

    const dismissed = await this.repository.dismissAlert(alertId, actor.id, now);
    if (!dismissed) throw new ServiceError("NOT_FOUND", "Alert not found", { alertId });

    for (const room of dealHealthRooms(ownership.salesRepId)) {
      emitRealtimeEvent(room, "deal-health:updated", {
        alertId: dismissed.id,
        type: dismissed.type,
        priority: dismissed.severity,
      });
    }
    return dismissed;
  }
}
