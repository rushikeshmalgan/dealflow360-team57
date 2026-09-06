"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { ApiClientError, apiRequest } from "@/lib/api-client";

type DealHealthAlertType = "STALLED_QUOTATION" | "DISCOUNT_ANOMALY" | "DELIVERY_SLIPPAGE" | "HIGH_RISK_DEAL";
type DealHealthSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type DealHealthAlertStatus = "OPEN" | "RESOLVED" | "DISMISSED";

type DealHealthAlert = {
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
  details: Record<string, unknown>;
  detectedAt: string;
  resolvedAt: string | null;
};

const ALERT_TYPE_LABELS: Record<DealHealthAlertType, string> = {
  STALLED_QUOTATION: "Stalled quotation",
  DISCOUNT_ANOMALY: "Discount anomaly",
  DELIVERY_SLIPPAGE: "Delivery slippage",
  HIGH_RISK_DEAL: "High-risk deal",
};

const SEVERITY_TONE: Record<DealHealthSeverity, string> = {
  LOW: "border-sky-400/30 bg-sky-400/10 text-sky-700",
  MEDIUM: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  HIGH: "border-orange-400/30 bg-orange-400/10 text-orange-700",
  CRITICAL: "border-rose-400/30 bg-rose-400/10 text-rose-700",
};

/** healthy/warning/critical indicator for one deal, derived from its open alerts' worst severity. */
function dealStatus(alerts: DealHealthAlert[]): "healthy" | "warning" | "critical" {
  const open = alerts.filter((a) => a.status === "OPEN");
  if (open.length === 0) return "healthy";
  return open.some((a) => a.severity === "HIGH" || a.severity === "CRITICAL") ? "critical" : "warning";
}

const STATUS_INDICATOR: Record<"healthy" | "warning" | "critical", { label: string; tone: string }> = {
  healthy: { label: "Healthy", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700" },
  warning: { label: "Warning", tone: "border-amber-400/30 bg-amber-400/10 text-amber-700" },
  critical: { label: "Critical", tone: "border-rose-400/30 bg-rose-400/10 text-rose-700" },
};

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A short, type-specific human explanation built from the alert's persisted `details`. */
function explain(alert: DealHealthAlert): string {
  const d = alert.details;
  switch (alert.type) {
    case "STALLED_QUOTATION":
      return `Idle ${num(d.inactivityDays) ?? "?"} days (threshold ${num(d.thresholdDays) ?? "?"})`;
    case "DISCOUNT_ANOMALY":
      return `${num(d.currentDiscountPct) ?? "?"}% vs rep avg ${num(d.baselineMeanPct) ?? "?"}% (+${
        num(d.deltaPct) ?? "?"
      }pp, ${num(d.sampleSize) ?? "?"} deals)`;
    case "DELIVERY_SLIPPAGE":
      return `${num(d.daysLate) ?? "?"} days late (promised ${
        str(d.promisedDate)?.slice(0, 10) ?? "?"
      }, now est. ${str(d.currentEstimateDate)?.slice(0, 10) ?? "?"})`;
    case "HIGH_RISK_DEAL": {
      const parts: string[] = [];
      if (d.riskBand) parts.push(`Risk ${str(d.riskBand)} (score ${num(d.riskScore) ?? "?"})`);
      if (num(d.pendingApprovalAgeHours) !== null) {
        parts.push(`Finance approval pending ${num(d.pendingApprovalAgeHours)}h`);
      }
      return parts.join(" · ") || "High risk";
    }
    default:
      return "";
  }
}

export default function DealHealthPage() {
  const [alerts, setAlerts] = useState<DealHealthAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const loadAlerts = useCallback(async () => {
    setError(null);
    try {
      const query = statusFilter === "OPEN" ? "?status=OPEN" : "";
      const data = await apiRequest<DealHealthAlert[]>(`/api/deal-health${query}`);
      setAlerts(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load deal health");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    loadAlerts();
  }, [loadAlerts]);

  // TAD SS34: the client never treats the realtime payload as authoritative - it just refetches.
  useRealtimeEvent("deal-health:updated", () => {
    loadAlerts();
  });

  const deals = useMemo(() => {
    const byQuotation = new Map<string, DealHealthAlert[]>();
    for (const alert of alerts) {
      byQuotation.set(alert.quotationId, [...(byQuotation.get(alert.quotationId) ?? []), alert]);
    }
    return [...byQuotation.entries()]
      .map(([quotationId, dealAlerts]) => ({
        quotationId,
        quotationCode: dealAlerts[0].quotationCode,
        customerName: dealAlerts[0].customerName,
        dealValue: dealAlerts[0].dealValue,
        status: dealStatus(dealAlerts),
        alerts: [...dealAlerts].sort((a, b) => b.priorityScore - a.priorityScore),
      }))
      .sort((a, b) => Math.max(...b.alerts.map((x) => x.priorityScore)) - Math.max(...a.alerts.map((x) => x.priorityScore)));
  }, [alerts]);

  const openCountByType = useMemo(() => {
    const counts: Record<DealHealthAlertType, number> = {
      STALLED_QUOTATION: 0,
      DISCOUNT_ANOMALY: 0,
      DELIVERY_SLIPPAGE: 0,
      HIGH_RISK_DEAL: 0,
    };
    for (const alert of alerts) {
      if (alert.status === "OPEN") counts[alert.type] += 1;
    }
    return counts;
  }, [alerts]);

  async function handleRefresh(quotationId: string) {
    setPendingIds((prev) => new Set(prev).add(`refresh:${quotationId}`));
    try {
      await apiRequest(`/api/deal-health/quotations/${quotationId}/refresh`, { method: "POST" });
      // The evaluation runs asynchronously; deal-health:updated (if anything changed) will
      // trigger a refetch, but poll once shortly after as a fallback in case nothing changed.
      setTimeout(loadAlerts, 1500);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to queue refresh");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(`refresh:${quotationId}`);
        return next;
      });
    }
  }

  async function handleDismiss(alertId: string) {
    setPendingIds((prev) => new Set(prev).add(`dismiss:${alertId}`));
    try {
      await apiRequest(`/api/deal-health/alerts/${alertId}/dismiss`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadAlerts();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to dismiss alert");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(`dismiss:${alertId}`);
        return next;
      });
    }
  }

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <DealFlowNav />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        <section className="rounded-xl border border-sky-200 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Risk intelligence</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Deal health monitor</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Deterministic stalled, discount, delivery, and risk signals across active quotations.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "OPEN" ? "default" : "outline"}
                className={statusFilter === "OPEN" ? "bg-sky-500 text-slate-950 hover:bg-sky-400" : "border-sky-200 bg-transparent text-slate-800 hover:bg-white"}
                onClick={() => setStatusFilter("OPEN")}
              >
                Open only
              </Button>
              <Button
                variant={statusFilter === "ALL" ? "default" : "outline"}
                className={statusFilter === "ALL" ? "bg-sky-500 text-slate-950 hover:bg-sky-400" : "border-sky-200 bg-transparent text-slate-800 hover:bg-white"}
                onClick={() => setStatusFilter("ALL")}
              >
                All history
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          {(Object.keys(ALERT_TYPE_LABELS) as DealHealthAlertType[]).map((type) => (
            <Card key={type} className="border-sky-200 bg-white">
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-slate-500">{ALERT_TYPE_LABELS[type]}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{openCountByType[type]}</p>
                <p className="mt-1 text-xs text-sky-700">open alerts</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <Card className="border-sky-200 bg-white">
          <CardHeader className="border-b border-sky-100">
            <CardTitle className="text-base">Affected deals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-slate-500">Loading deal health…</p>
            ) : deals.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No {statusFilter === "OPEN" ? "open" : ""} alerts.</p>
            ) : (
              <div className="divide-y divide-sky-100">
                {deals.map((deal) => (
                  <div key={deal.quotationId} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Badge className={`w-fit border ${STATUS_INDICATOR[deal.status].tone}`}>
                          {STATUS_INDICATOR[deal.status].label}
                        </Badge>
                        <div>
                          <p className="font-semibold text-slate-900">{deal.quotationCode}</p>
                          <p className="text-xs text-slate-500">{deal.customerName} · ${Number(deal.dealValue).toLocaleString()}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-sky-200 bg-transparent text-slate-800 hover:bg-white"
                        disabled={pendingIds.has(`refresh:${deal.quotationId}`)}
                        onClick={() => handleRefresh(deal.quotationId)}
                      >
                        {pendingIds.has(`refresh:${deal.quotationId}`) ? "Queuing…" : "Refresh"}
                      </Button>
                    </div>

                    <div className="space-y-2 pl-1">
                      {deal.alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-100 bg-sky-50 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`w-fit border ${SEVERITY_TONE[alert.severity]}`}>{alert.severity}</Badge>
                            <span className="text-xs font-semibold text-slate-800">{ALERT_TYPE_LABELS[alert.type]}</span>
                            <span className="text-xs text-slate-500">priority {alert.priorityScore}</span>
                            {alert.status !== "OPEN" && (
                              <Badge variant="outline" className="border-sky-200 text-slate-500">
                                {alert.status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{explain(alert)}</p>
                          {alert.status === "OPEN" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-500 hover:text-slate-900"
                              disabled={pendingIds.has(`dismiss:${alert.id}`)}
                              onClick={() => handleDismiss(alert.id)}
                            >
                              Dismiss
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
