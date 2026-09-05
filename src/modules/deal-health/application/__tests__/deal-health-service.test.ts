import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/shared/domain/actor";

import { DealHealthService } from "../deal-health-service";
import type { AlertWriteResult, DealHealthRepository, UpsertAlertInput } from "../ports";
import type { DealHealthAlertDto, DealHealthListQuery, QuotationHealthSnapshot } from "../types";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/jobs/outbox", () => ({ enqueueOutboxEvent: vi.fn().mockResolvedValue({ id: "outbox-1" }) }));
vi.mock("@/realtime/emit", () => ({ emitRealtimeEvent: vi.fn() }));

const NOW = new Date("2026-06-01T00:00:00.000Z");

const REP: Actor = { id: "rep-1", role: "SALES_REP" };
const OTHER_REP: Actor = { id: "rep-2", role: "SALES_REP" };
const MANAGER: Actor = { id: "mgr-1", role: "MANAGER" };
const CUSTOMER: Actor = { id: "cust-user-1", role: "CUSTOMER", customerId: "cust-1" };

function baseSnapshot(overrides: Partial<QuotationHealthSnapshot> = {}): QuotationHealthSnapshot {
  return {
    id: "q-1",
    code: "Q-1",
    status: "UNDER_NEGOTIATION",
    salesRepId: REP.id,
    customerId: "cust-1",
    customerName: "Acme",
    createdAt: NOW,
    lastActivityAt: NOW,
    dealValue: 10_000,
    currentDiscountPct: 10,
    latestRisk: null,
    pendingFinanceApprovalSince: null,
    delivery: null,
    ...overrides,
  };
}

function alertDto(overrides: Partial<DealHealthAlertDto> = {}): DealHealthAlertDto {
  return {
    id: "alert-1",
    quotationId: "q-1",
    quotationCode: "Q-1",
    customerId: "cust-1",
    customerName: "Acme",
    salesRepId: REP.id,
    type: "STALLED_QUOTATION",
    status: "OPEN",
    severity: "HIGH",
    priorityScore: 80,
    dealValue: "10000",
    details: {},
    detectedAt: NOW.toISOString(),
    resolvedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

class FakeDealHealthRepository implements DealHealthRepository {
  snapshot: QuotationHealthSnapshot | null = baseSnapshot();
  discountHistory: number[] = [];
  alertsByQuotation = new Map<string, DealHealthAlertDto[]>();
  upsertCalls: UpsertAlertInput[] = [];
  resolveCalls: Array<{ quotationId: string; type: string }> = [];
  ownershipByAlertId = new Map<string, { quotationId: string; salesRepId: string }>();

  async listActiveQuotationIds(limit: number): Promise<string[]> {
    return this.snapshot ? [this.snapshot.id].slice(0, limit) : [];
  }

  async getSnapshot(quotationId: string): Promise<QuotationHealthSnapshot | null> {
    return this.snapshot && this.snapshot.id === quotationId ? this.snapshot : null;
  }

  async getRepDiscountHistory(): Promise<number[]> {
    return this.discountHistory;
  }

  async upsertOpenAlert(input: UpsertAlertInput): Promise<AlertWriteResult> {
    this.upsertCalls.push(input);
    const alert = alertDto({
      id: `alert-${input.type}`,
      quotationId: input.quotationId,
      type: input.type,
      severity: input.severity,
      priorityScore: input.priorityScore,
      dealValue: String(input.dealValue),
      details: input.details,
      status: "OPEN",
    });
    const existing = this.alertsByQuotation.get(input.quotationId) ?? [];
    this.alertsByQuotation.set(
      input.quotationId,
      [...existing.filter((a) => a.type !== input.type), alert],
    );
    return { alert, changed: true };
  }

  async resolveAlertIfOpen(quotationId: string, type: string): Promise<AlertWriteResult | null> {
    this.resolveCalls.push({ quotationId, type });
    return null;
  }

  async listAlerts(query: DealHealthListQuery): Promise<DealHealthAlertDto[]> {
    const all = [...this.alertsByQuotation.values()].flat();
    return query.salesRepId ? all.filter((a) => a.salesRepId === query.salesRepId) : all;
  }

  async getAlertsForQuotation(quotationId: string): Promise<DealHealthAlertDto[]> {
    return this.alertsByQuotation.get(quotationId) ?? [];
  }

  async getAlertOwnership(alertId: string) {
    return this.ownershipByAlertId.get(alertId) ?? null;
  }

  async dismissAlert(alertId: string): Promise<DealHealthAlertDto | null> {
    return alertDto({ id: alertId, status: "DISMISSED" });
  }
}

describe("DealHealthService authorization", () => {
  let repo: FakeDealHealthRepository;
  let service: DealHealthService;

  beforeEach(() => {
    repo = new FakeDealHealthRepository();
    service = new DealHealthService(repo);
  });

  it("rejects an unauthenticated actor", async () => {
    await expect(service.listAlerts(null, {})).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("rejects a CUSTOMER actor outright", async () => {
    await expect(service.listAlerts(CUSTOMER, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.getQuotationHealth(CUSTOMER, "q-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("scopes a Sales Rep's alert list to their own quotations only, ignoring a client-supplied salesRepId", async () => {
    repo.alertsByQuotation.set("q-1", [alertDto({ salesRepId: REP.id })]);
    repo.alertsByQuotation.set("q-2", [alertDto({ id: "alert-2", quotationId: "q-2", salesRepId: OTHER_REP.id })]);

    // Even if the rep tries to ask for someone else's alerts, the service overrides it with
    // their own id (never trusts a caller-supplied salesRepId for a non-internal-wide role).
    const result = await service.listAlerts(REP, { salesRepId: OTHER_REP.id });
    expect(result.map((a) => a.salesRepId)).toEqual([REP.id]);
  });

  it("lets Manager/Admin/Finance see alerts across all reps (team/org scope)", async () => {
    repo.alertsByQuotation.set("q-1", [alertDto({ salesRepId: REP.id })]);
    repo.alertsByQuotation.set("q-2", [alertDto({ id: "alert-2", quotationId: "q-2", salesRepId: OTHER_REP.id })]);

    const result = await service.listAlerts(MANAGER, {});
    expect(result).toHaveLength(2);
  });

  it("lets a Sales Rep view their own quotation's health", async () => {
    repo.snapshot = baseSnapshot({ salesRepId: REP.id });
    await expect(service.getQuotationHealth(REP, "q-1")).resolves.toMatchObject({ quotationId: "q-1" });
  });

  it("denies a Sales Rep viewing another rep's quotation health", async () => {
    repo.snapshot = baseSnapshot({ salesRepId: OTHER_REP.id });
    await expect(service.getQuotationHealth(REP, "q-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("404s for a quotation that doesn't exist", async () => {
    repo.snapshot = null;
    await expect(service.getQuotationHealth(MANAGER, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("denies a Sales Rep dismissing an alert - Manager/Admin only", async () => {
    await expect(service.dismissAlert(REP, "alert-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a Manager to dismiss an alert", async () => {
    repo.ownershipByAlertId.set("alert-1", { quotationId: "q-1", salesRepId: REP.id });
    await expect(service.dismissAlert(MANAGER, "alert-1")).resolves.toMatchObject({ status: "DISMISSED" });
  });

  it("denies a Sales Rep refreshing another rep's quotation", async () => {
    repo.snapshot = baseSnapshot({ salesRepId: OTHER_REP.id });
    await expect(service.refreshQuotation(REP, "q-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("DealHealthService.evaluateQuotation orchestration", () => {
  it("upserts an alert when a rule fires and evaluates the discount-history-dependent rule too", async () => {
    const repo = new FakeDealHealthRepository();
    repo.snapshot = baseSnapshot({ lastActivityAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000) }); // 30 days stale
    const service = new DealHealthService(repo);

    const summary = await service.evaluateQuotation("q-1", NOW);

    expect(summary?.status).toBe("critical");
    const stalledCall = repo.upsertCalls.find((c) => c.type === "STALLED_QUOTATION");
    expect(stalledCall?.severity).toBe("CRITICAL");
  });

  it("resolves rather than upserts when no rule fires", async () => {
    const repo = new FakeDealHealthRepository();
    repo.snapshot = baseSnapshot(); // fresh, no risk, no delivery -> nothing should fire
    const service = new DealHealthService(repo);

    await service.evaluateQuotation("q-1", NOW);

    expect(repo.upsertCalls).toHaveLength(0);
    expect(repo.resolveCalls.map((c) => c.type).sort()).toEqual(
      ["DELIVERY_SLIPPAGE", "DISCOUNT_ANOMALY", "HIGH_RISK_DEAL", "STALLED_QUOTATION"].sort(),
    );
  });

  it("returns null for a quotation the repository doesn't know about", async () => {
    const repo = new FakeDealHealthRepository();
    repo.snapshot = null;
    const service = new DealHealthService(repo);
    await expect(service.evaluateQuotation("missing", NOW)).resolves.toBeNull();
  });
});
