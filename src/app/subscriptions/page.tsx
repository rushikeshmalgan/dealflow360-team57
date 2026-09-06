"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  DollarSign,
  FileText,
  Plus,
  RefreshCw,
  Sliders,
  XCircle,
} from "lucide-react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { CustomerDto } from "@/modules/customers/application/types";
import type {
  BillingDetailDto,
  SubscriptionDto,
  SubscriptionModificationDto,
  SubscriptionPlanDto,
} from "@/modules/subscription";

const STATUS_VARIANTS: Record<
  SubscriptionDto["status"],
  { tone: "default" | "secondary" | "destructive" | "outline"; badgeClass: string }
> = {
  ACTIVE: {
    tone: "default",
    badgeClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700",
  },
  PAUSED: {
    tone: "secondary",
    badgeClass: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  },
  CANCELLED: {
    tone: "destructive",
    badgeClass: "border-rose-400/30 bg-rose-400/10 text-rose-700",
  },
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[] | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanDto[] | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Create modal state
  const [isCreating, setIsCreating] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newPlanId, setNewPlanId] = useState("");
  const [newCycle, setNewCycle] = useState<"MONTHLY" | "QUARTERLY" | "YEARLY">("MONTHLY");
  const [newAmount, setNewAmount] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Billing detail modal state (Screen 10)
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [billingDetail, setBillingDetail] = useState<BillingDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modify / Proration modal state (T10.2)
  const [modifyingSub, setModifyingSub] = useState<SubscriptionDto | null>(null);
  const [modifyPlanId, setModifyPlanId] = useState("");
  const [modifyAmount, setModifyAmount] = useState("");
  const [modifyCycle, setModifyCycle] = useState<"MONTHLY" | "QUARTERLY" | "YEARLY">("MONTHLY");
  const [modifySubmitting, setModifySubmitting] = useState(false);
  const [modifyResult, setModifyResult] = useState<SubscriptionModificationDto | null>(null);
  const [modifyError, setModifyError] = useState<string | null>(null);

  // Cancel modal state (T10.3)
  const [cancellingSub, setCancellingSub] = useState<SubscriptionDto | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [subsRes, plansRes, custRes] = await Promise.all([
        apiRequest<SubscriptionDto[]>("/api/subscriptions"),
        apiRequest<SubscriptionPlanDto[]>("/api/subscription-plans").catch(() => []),
        apiRequest<CustomerDto[]>("/api/customers").catch(() => []),
      ]);
      setSubscriptions(subsRes);
      setPlans(plansRes);
      setCustomers(custRes);

      if (custRes.length > 0 && !newCustomerId) {
        setNewCustomerId(custRes[0].id);
      }
      if (plansRes.length > 0 && !newPlanId) {
        setNewPlanId(plansRes[0].id);
        setNewAmount(plansRes[0].product?.price ? String(plansRes[0].product.price) : "299.00");
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleOpenBillingDetail(id: string) {
    setSelectedSubId(id);
    setDetailLoading(true);
    setBillingDetail(null);
    try {
      const detail = await apiRequest<BillingDetailDto>(`/api/subscriptions/${id}/billing`);
      setBillingDetail(detail);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load billing detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleOpenModify(sub: SubscriptionDto) {
    setModifyingSub(sub);
    setModifyPlanId(sub.planId);
    setModifyCycle(sub.cycle);
    setModifyAmount(sub.billingSchedules?.[0]?.amount ?? "300.00");
    setModifyResult(null);
    setModifyError(null);
  }

  async function handleApplyModify(e: React.FormEvent) {
    e.preventDefault();
    if (!modifyingSub) return;
    setModifySubmitting(true);
    setModifyError(null);
    try {
      const result = await apiRequest<SubscriptionModificationDto>(
        `/api/subscriptions/${modifyingSub.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            planId: modifyPlanId || undefined,
            cycle: modifyCycle,
            amount: Number(modifyAmount) || 0,
            expectedVersion: modifyingSub.version,
          }),
        },
      );
      setModifyResult(result);
      await loadData();
    } catch (err) {
      setModifyError(
        err instanceof ApiClientError ? err.message : "Failed to modify subscription.",
      );
    } finally {
      setModifySubmitting(false);
    }
  }

  async function handleConfirmCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!cancellingSub) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const result = await apiRequest<{
        subscription: SubscriptionDto;
        cancellation: { refundAmount: number; creditNoteRequired: boolean; explanation: string };
        creditNote?: { id: string; amount: string };
      }>(`/api/subscriptions/${cancellingSub.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({
          reason: cancelReason || "Customer cancellation",
          immediate: true,
          expectedVersion: cancellingSub.version,
        }),
      });

      setCancelSuccessMsg(
        `Subscription cancelled successfully. ${
          result.creditNote
            ? `Credit Note of $${result.creditNote.amount} generated.`
            : "No refund applicable."
        }`,
      );
      await loadData();
      setTimeout(() => {
        setCancellingSub(null);
        setCancelSuccessMsg(null);
        setCancelReason("");
      }, 2000);
    } catch (err) {
      setCancelError(
        err instanceof ApiClientError ? err.message : "Failed to cancel subscription.",
      );
    } finally {
      setCancelSubmitting(false);
    }
  }

  async function handleCreateSubscription(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await apiRequest<SubscriptionDto>("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customerId: newCustomerId,
          planId: newPlanId,
          cycle: newCycle,
          amount: Number(newAmount) || 0,
        }),
      });
      setIsCreating(false);
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiClientError ? err.message : "Failed to create subscription.",
      );
    } finally {
      setCreateSubmitting(false);
    }
  }

  const filteredSubs = (subscriptions ?? []).filter((sub) => {
    if (statusFilter === "ALL") return true;
    return sub.status === statusFilter;
  });

  const activeCount = (subscriptions ?? []).filter((s) => s.status === "ACTIVE").length;
  const mrrTotal = (subscriptions ?? [])
    .filter((s) => s.status === "ACTIVE")
    .reduce((sum, s) => {
      const amount = Number(s.billingSchedules?.[0]?.amount || 0);
      if (s.cycle === "YEARLY") return sum + amount / 12;
      if (s.cycle === "QUARTERLY") return sum + amount / 3;
      return sum + amount;
    }, 0);

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Top Header Card */}
        <section className="rounded-xl border border-sky-200 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-600 uppercase">
                Module N · Epic 10
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Subscriptions &amp; Billing
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Hybrid billing architecture (FR-BILL-001). Monitor active recurring contracts,
                prorate plan changes, inspect originating order lines, and trigger credit note refunds.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="border-sky-200 bg-white text-slate-800 hover:bg-sky-100"
              >
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="bg-sky-500 font-medium text-white hover:bg-sky-400"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Subscription
              </Button>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Active Subscriptions</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{activeCount}</div>
              <div className="mt-1 text-xs text-slate-500">Total contracts live</div>
            </div>

            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Monthly Recurring</span>
                <DollarSign className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                ${mrrTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 text-xs text-slate-500">Normalized MRR basis</div>
            </div>

            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Proration &amp; Rules</span>
                <Sliders className="h-4 w-4 text-purple-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">Day-Based</div>
              <div className="mt-1 text-xs text-slate-500">TAD §25 Transparent Config</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Subscriptions Table Section */}
        <section className="rounded-xl border border-sky-100 bg-white p-6 shadow-xl">
          {/* Status Filter Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-sky-100 pb-4">
            <div className="flex items-center gap-2">
              {["ALL", "ACTIVE", "PAUSED", "CANCELLED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter === st
                      ? "bg-sky-500 text-white"
                      : "bg-sky-50 text-slate-600 hover:bg-sky-100"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500">
              Showing {filteredSubs.length} subscription{filteredSubs.length === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading subscriptions...</div>
          ) : filteredSubs.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No subscriptions match the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-sky-100 hover:bg-transparent">
                    <TableHead className="text-slate-600">Customer</TableHead>
                    <TableHead className="text-slate-600">Plan &amp; Cadence</TableHead>
                    <TableHead className="text-slate-600">Next Bill Date</TableHead>
                    <TableHead className="text-slate-600">Current Amount</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-right text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubs.map((sub) => {
                    const currentSchedule = sub.billingSchedules?.[0];
                    const amountStr = currentSchedule ? `$${currentSchedule.amount}` : "—";
                    const statusMeta = STATUS_VARIANTS[sub.status] || STATUS_VARIANTS.ACTIVE;

                    return (
                      <TableRow
                        key={sub.id}
                        className="border-sky-100 transition-colors hover:bg-sky-50"
                      >
                        <TableCell className="font-medium text-slate-900">
                          {sub.customer?.name || "Customer " + sub.customerId.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-800">
                            {sub.plan?.name || "Custom SLA"}
                          </div>
                          <div className="text-xs text-slate-500">{sub.cycle}</div>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {new Date(sub.nextBillDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">{amountStr}</TableCell>
                        <TableCell>
                          <Badge
                            variant={statusMeta.tone}
                            className={`border px-2 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}
                          >
                            {sub.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenBillingDetail(sub.id)}
                              className="border-sky-100 bg-sky-50 text-xs text-slate-800 hover:bg-sky-100"
                              title="Screen 10 Billing Detail"
                            >
                              <FileText className="mr-1 h-3.5 w-3.5 text-sky-600" />
                              Detail
                            </Button>

                            {sub.status === "ACTIVE" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenModify(sub)}
                                  className="border-sky-100 bg-sky-50 text-xs text-slate-800 hover:bg-sky-100"
                                  title="T10.2 Proration Engine"
                                >
                                  <Sliders className="mr-1 h-3.5 w-3.5 text-purple-600" />
                                  Modify
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCancellingSub(sub);
                                    setCancelError(null);
                                    setCancelSuccessMsg(null);
                                  }}
                                  className="border-rose-900/40 bg-rose-950/20 text-xs text-rose-700 hover:bg-rose-900/40"
                                  title="T10.3 Cancel &amp; Refund"
                                >
                                  <XCircle className="mr-1 h-3.5 w-3.5 text-rose-600" />
                                  Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </main>

      {/* MODAL 1: Create New Subscription */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-lg border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="border-b border-sky-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900">
                Create New Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreateSubscription} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">
                    {createError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Customer</Label>
                  <select
                    value={newCustomerId}
                    onChange={(e) => setNewCustomerId(e.target.value)}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
                    required
                  >
                    {(customers ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Subscription Plan</Label>
                  <select
                    value={newPlanId}
                    onChange={(e) => {
                      setNewPlanId(e.target.value);
                      const p = plans?.find((plan) => plan.id === e.target.value);
                      if (p?.product?.price) setNewAmount(String(p.product.price));
                      if (p?.cadence) setNewCycle(p.cadence);
                    }}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
                    required
                  >
                    {(plans ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.cadence}) - ${p.product?.price ?? "0.00"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Billing Cadence</Label>
                    <select
                      value={newCycle}
                      onChange={(e) =>
                        setNewCycle(e.target.value as "MONTHLY" | "QUARTERLY" | "YEARLY")
                      }
                      className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="QUARTERLY">QUARTERLY</option>
                      <option value="YEARLY">YEARLY</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="border-sky-100 bg-white text-slate-900"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreating(false)}
                    className="border-sky-100 text-slate-600 hover:bg-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createSubmitting}
                    className="bg-sky-500 font-semibold text-white hover:bg-sky-400"
                  >
                    {createSubmitting ? "Creating..." : "Create Subscription"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL 2: Screen 10 Billing Detail View */}
      {selectedSubId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-sky-100 pb-4">
              <div>
                <span className="text-xs font-semibold text-sky-600 uppercase">Screen 10</span>
                <CardTitle className="text-lg font-bold text-slate-900">Billing Detail</CardTitle>
                <p className="text-xs text-slate-500">
                  Customer: {billingDetail?.customerName} · Plan: {billingDetail?.planName}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSubId(null)}
                className="text-slate-500 hover:text-slate-900"
              >
                ✕
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              {detailLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  Loading billing detail...
                </div>
              ) : billingDetail ? (
                <>
                  {/* Originating Order One-Time Lines Table */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                      From Originating Order (One-Time Lines)
                    </h3>
                    {billingDetail.originatingOrder.oneTimeLines.length === 0 ? (
                      <p className="rounded border border-sky-100 bg-white p-3 text-xs text-slate-500">
                        No one-time hardware/software lines associated with this order.
                      </p>
                    ) : (
                      <div className="rounded-lg border border-sky-100 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-sky-100 bg-sky-50">
                              <TableHead className="text-xs text-slate-600">Product</TableHead>
                              <TableHead className="text-xs text-slate-600">Qty</TableHead>
                              <TableHead className="text-xs text-slate-600">Unit Price</TableHead>
                              <TableHead className="text-right text-xs text-slate-600">
                                Amount
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {billingDetail.originatingOrder.oneTimeLines.map((line) => (
                              <TableRow key={line.id} className="border-sky-100">
                                <TableCell className="text-xs font-medium text-slate-900">
                                  {line.description}
                                </TableCell>
                                <TableCell className="text-xs text-slate-600">
                                  {line.quantity}
                                </TableCell>
                                <TableCell className="text-xs text-slate-600">
                                  ${line.unitPrice}
                                </TableCell>
                                <TableCell className="text-right text-xs font-semibold text-emerald-600">
                                  ${line.amount}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Ongoing Recurring Subscriptions Table */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                      Ongoing Recurring Subscriptions
                    </h3>
                    <div className="rounded-lg border border-sky-100 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-sky-100 bg-sky-50">
                            <TableHead className="text-xs text-slate-600">Plan</TableHead>
                            <TableHead className="text-xs text-slate-600">Cycle</TableHead>
                            <TableHead className="text-xs text-slate-600">Next Bill</TableHead>
                            <TableHead className="text-right text-xs text-slate-600">
                              Amount
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billingDetail.recurringLines.map((line) => (
                            <TableRow key={line.id} className="border-sky-100">
                              <TableCell className="text-xs font-medium text-slate-900">
                                {line.planName}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600">{line.cycle}</TableCell>
                              <TableCell className="text-xs text-slate-600">
                                {new Date(line.nextBillDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right text-xs font-semibold text-sky-600">
                                ${line.amount}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Billing Schedules */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                      Billing Schedules (T10.1 Cadence)
                    </h3>
                    <div className="rounded-lg border border-sky-100 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-sky-100 bg-sky-50">
                            <TableHead className="text-xs text-slate-600">Cycle Period</TableHead>
                            <TableHead className="text-xs text-slate-600">Status</TableHead>
                            <TableHead className="text-right text-xs text-slate-600">
                              Scheduled Amount
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billingDetail.billingSchedules.map((sched) => (
                            <TableRow key={sched.id} className="border-sky-100">
                              <TableCell className="text-xs text-slate-800">
                                {new Date(sched.cycleStart).toLocaleDateString()} →{" "}
                                {new Date(sched.cycleEnd).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">
                                  {sched.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-xs font-semibold text-slate-900">
                                ${sched.amount}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL 3: T10.2 Proration Engine Modification */}
      {modifyingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <Card className="w-full max-w-lg border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="border-b border-sky-100 pb-4">
              <span className="text-xs font-semibold text-purple-600 uppercase">
                T10.2 · Proration Engine
              </span>
              <CardTitle className="text-lg font-bold text-slate-900">
                Modify Subscription Plan
              </CardTitle>
              <p className="text-xs text-slate-500">
                Transparent day-based proration strategy (TAD §25). Calculates unused credit and net
                adjustment mid-cycle.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {modifyError && (
                <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">
                  {modifyError}
                </div>
              )}

              {modifyResult ? (
                <div className="space-y-4 rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
                  <div className="flex items-center text-sm font-semibold text-purple-700">
                    <CheckCircle2 className="mr-2 h-4 w-4 text-purple-600" />
                    Proration Applied Successfully
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p>{modifyResult.proration.explanation}</p>
                    <p className="font-semibold text-slate-900">
                      Net adjustment:{" "}
                      {modifyResult.proration.netAdjustment >= 0 ? "+" : ""}$
                      {modifyResult.proration.netAdjustment.toFixed(2)}
                    </p>
                  </div>
                  <Button
                    onClick={() => setModifyingSub(null)}
                    className="w-full bg-purple-600 font-semibold text-white hover:bg-purple-500"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleApplyModify} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Change Plan</Label>
                    <select
                      value={modifyPlanId}
                      onChange={(e) => {
                        setModifyPlanId(e.target.value);
                        const p = plans?.find((plan) => plan.id === e.target.value);
                        if (p?.product?.price) setModifyAmount(String(p.product.price));
                      }}
                      className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {(plans ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.cadence}) - ${p.product?.price ?? "0.00"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">New Target Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={modifyAmount}
                      onChange={(e) => setModifyAmount(e.target.value)}
                      className="border-sky-100 bg-white text-slate-900"
                      required
                    />
                  </div>

                  <div className="rounded-md border border-sky-100 bg-white p-3 text-xs text-slate-600 space-y-1">
                    <span className="font-semibold text-slate-900">Strategy: DAY_BASED</span>
                    <p className="text-slate-500">
                      Unused days on the current cycle will be credited, and remaining days will be
                      charged at the new daily rate.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModifyingSub(null)}
                      className="border-sky-100 text-slate-600 hover:bg-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={modifySubmitting}
                      className="bg-purple-600 font-semibold text-white hover:bg-purple-500"
                    >
                      {modifySubmitting ? "Calculating..." : "Apply Proration"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL 4: T10.3 Cancellation & Credit Note Trigger */}
      {cancellingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <Card className="w-full max-w-lg border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="border-b border-sky-100 pb-4">
              <span className="text-xs font-semibold text-rose-600 uppercase">
                T10.3 · Cancellation &amp; Refund
              </span>
              <CardTitle className="text-lg font-bold text-slate-900">
                Cancel Subscription &amp; Trigger Credit Note
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {cancelError && (
                <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">
                  {cancelError}
                </div>
              )}

              {cancelSuccessMsg ? (
                <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                  {cancelSuccessMsg}
                </div>
              ) : (
                <form onSubmit={handleConfirmCancel} className="space-y-4">
                  <p className="text-xs text-slate-600">
                    Under the configured cancellation policy (
                    <code className="text-rose-700">PRO_RATA_REFUND</code>), cancelling immediately
                    will calculate unused duration in the current billing cycle and issue a{" "}
                    <strong>Credit Note</strong> against the invoice.
                  </p>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Cancellation Reason</Label>
                    <Input
                      type="text"
                      placeholder="e.g. Contract terminated early or client requested downgrade"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="border-sky-100 bg-white text-slate-900"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCancellingSub(null)}
                      className="border-sky-100 text-slate-600 hover:bg-white"
                    >
                      Keep Subscription
                    </Button>
                    <Button
                      type="submit"
                      disabled={cancelSubmitting}
                      className="bg-rose-600 font-semibold text-white hover:bg-rose-500"
                    >
                      {cancelSubmitting ? "Processing..." : "Confirm Cancellation"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
