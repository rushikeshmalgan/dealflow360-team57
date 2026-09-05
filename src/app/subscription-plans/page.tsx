"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Layers,
  Plus,
  RefreshCw,
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
import type { SubscriptionPlanDto } from "@/modules/subscription";

type ProductDto = { id: string; name: string; sku: string };

const CADENCE_COLORS: Record<string, string> = {
  MONTHLY: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  QUARTERLY: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  YEARLY: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlanDto[] | null>(null);
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCadence, setNewCadence] = useState<"MONTHLY" | "QUARTERLY" | "YEARLY">("MONTHLY");
  const [newProductId, setNewProductId] = useState<string>("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Expanded detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, prodsRes] = await Promise.all([
        apiRequest<SubscriptionPlanDto[]>("/api/subscription-plans"),
        apiRequest<ProductDto[]>("/api/products").catch(() => []),
      ]);
      setPlans(plansRes);
      setProducts(prodsRes);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load subscription plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await apiRequest("/api/subscription-plans", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          cadence: newCadence,
          productId: newProductId || null,
        }),
      });
      setIsCreating(false);
      setNewName("");
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create plan.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const activeCount = (plans ?? []).filter((p) => p.isActive).length;
  const monthlyCt = (plans ?? []).filter((p) => p.cadence === "MONTHLY").length;
  const quarterlyCt = (plans ?? []).filter((p) => p.cadence === "QUARTERLY").length;
  const yearlyCt = (plans ?? []).filter((p) => p.cadence === "YEARLY").length;

  return (
    <div className="min-h-screen bg-[#171b22] text-slate-100">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Header */}
        <section className="rounded-xl border border-slate-600/60 bg-[#232a34] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-400 uppercase">
                Recurring Revenue
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Subscription Plans
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Define recurring billing plans with cadence, linked products, and proration/cancellation rules.
                Plans are assigned to subscriptions during creation.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}
                className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700">
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setIsCreating(true)}
                className="bg-sky-500 font-medium text-white hover:bg-sky-400">
                <Plus className="mr-1.5 h-4 w-4" />
                New Plan
              </Button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Total Plans</span>
                <Layers className="h-4 w-4 text-sky-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{plans?.length ?? "—"}</div>
              <div className="mt-1 text-xs text-slate-400">{activeCount} active</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Cadence Split</span>
                <CalendarClock className="h-4 w-4 text-violet-400" />
              </div>
              <div className="mt-2 text-lg font-bold text-white">
                {monthlyCt}M / {quarterlyCt}Q / {yearlyCt}Y
              </div>
              <div className="mt-1 text-xs text-slate-400">Monthly / Quarterly / Yearly</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>With Product</span>
                <Layers className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                {(plans ?? []).filter((p) => p.productId).length}
              </div>
              <div className="mt-1 text-xs text-slate-400">Product-linked plans</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>
        )}

        {/* Plans Table */}
        <section className="rounded-xl border border-slate-700/60 bg-[#232a34] p-6 shadow-xl">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading plans...</div>
          ) : (plans ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No subscription plans yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Plan Name</TableHead>
                    <TableHead className="text-slate-300">Cadence</TableHead>
                    <TableHead className="text-slate-300">Product</TableHead>
                    <TableHead className="text-slate-300">Price</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Created</TableHead>
                    <TableHead className="text-right text-slate-300">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(plans ?? []).map((plan) => (
                    <>
                      <TableRow key={plan.id}
                        className="border-slate-800 transition-colors hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === plan.id ? null : plan.id)}>
                        <TableCell className="font-medium text-white">{plan.name}</TableCell>
                        <TableCell>
                          <Badge className={`border text-xs ${CADENCE_COLORS[plan.cadence] ?? ""}`}>
                            {plan.cadence}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-300">
                          {plan.product ? plan.product.name : <span className="text-slate-500">—</span>}
                        </TableCell>
                        <TableCell className="font-semibold text-emerald-400">
                          {plan.product?.price ? `$${plan.product.price}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`border text-xs ${plan.isActive ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-slate-400/30 bg-slate-400/10 text-slate-300"}`}>
                            {plan.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">
                          {new Date(plan.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {expandedId === plan.id ? "▲" : "▼"}
                        </TableCell>
                      </TableRow>
                      {expandedId === plan.id && (
                        <TableRow key={`${plan.id}-detail`} className="border-slate-800 bg-slate-800/20">
                          <TableCell colSpan={7} className="px-8 py-4">
                            <div className="grid grid-cols-3 gap-6 text-xs">
                              <div>
                                <p className="font-bold text-slate-300 uppercase mb-2">Proration Rule</p>
                                <pre className="rounded bg-[#171b22] p-2 text-slate-400 overflow-auto max-h-32">
                                  {JSON.stringify(plan.prorationRule, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="font-bold text-slate-300 uppercase mb-2">Cancellation Rule</p>
                                <pre className="rounded bg-[#171b22] p-2 text-slate-400 overflow-auto max-h-32">
                                  {JSON.stringify(plan.cancellationRule, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="font-bold text-slate-300 uppercase mb-2">Partial Refund Rule</p>
                                <pre className="rounded bg-[#171b22] p-2 text-slate-400 overflow-auto max-h-32">
                                  {JSON.stringify(plan.partialRefundRule, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </main>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-lg border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white">Create Subscription Plan</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">{createError}</div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Plan Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Enterprise Monthly SLA"
                    className="border-slate-700 bg-[#232a34] text-slate-100" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">Cadence</Label>
                    <select value={newCadence}
                      onChange={(e) => setNewCadence(e.target.value as "MONTHLY" | "QUARTERLY" | "YEARLY")}
                      className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="QUARTERLY">QUARTERLY</option>
                      <option value="YEARLY">YEARLY</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">Product (optional)</Label>
                    <select value={newProductId}
                      onChange={(e) => setNewProductId(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                      <option value="">None</option>
                      {(products ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Default proration, cancellation, and partial refund rules will be applied automatically.
                </p>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreating(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
                  <Button type="submit" disabled={createSubmitting}
                    className="bg-sky-500 font-semibold text-white hover:bg-sky-400">
                    {createSubmitting ? "Creating..." : "Create Plan"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
