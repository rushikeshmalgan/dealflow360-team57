"use client";

import { useEffect, useState } from "react";
import {
  Percent,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
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
import type { TierDto } from "@/modules/customers/application/types";
import type { DiscountRuleDto, ResolvedCeilingDto } from "@/modules/discount-risk/application/types";

type CategoryDto = { id: string; name: string };

export default function DiscountRulesPage() {
  const [rules, setRules] = useState<DiscountRuleDto[] | null>(null);
  const [tiers, setTiers] = useState<TierDto[] | null>(null);
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create
  const [isCreating, setIsCreating] = useState(false);
  const [newScope, setNewScope] = useState<"TIER" | "CATEGORY">("TIER");
  const [newTierId, setNewTierId] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newMaxPct, setNewMaxPct] = useState("20");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Resolve ceiling
  const [showResolver, setShowResolver] = useState(false);
  const [resolveTierId, setResolveTierId] = useState("");
  const [resolveCategoryId, setResolveCategoryId] = useState("");
  const [resolveResult, setResolveResult] = useState<ResolvedCeilingDto | null>(null);
  const [resolving, setResolving] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, tiersRes, catsRes] = await Promise.all([
        apiRequest<DiscountRuleDto[]>("/api/discount-rules"),
        apiRequest<TierDto[]>("/api/customer-tiers").catch(() => []),
        apiRequest<CategoryDto[]>("/api/categories").catch(() => []),
      ]);
      setRules(rulesRes);
      setTiers(tiersRes);
      setCategories(catsRes);
      if (tiersRes.length > 0 && !newTierId) {
        setNewTierId(tiersRes[0].id);
        setResolveTierId(tiersRes[0].id);
      }
      if (catsRes.length > 0 && !newCategoryId) setNewCategoryId(catsRes[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load discount rules.");
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
      await apiRequest("/api/discount-rules", {
        method: "POST",
        body: JSON.stringify({
          scope: newScope,
          tierId: newScope === "TIER" ? newTierId : null,
          categoryId: newScope === "CATEGORY" ? newCategoryId : null,
          maxDiscountPct: Number(newMaxPct),
        }),
      });
      setIsCreating(false);
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create rule.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    setResolving(true);
    setResolveResult(null);
    try {
      const params = new URLSearchParams({ resolve: "true", tierId: resolveTierId });
      if (resolveCategoryId) params.set("categoryId", resolveCategoryId);
      const result = await apiRequest<ResolvedCeilingDto>(`/api/discount-rules?${params}`);
      setResolveResult(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to resolve ceiling.");
    } finally {
      setResolving(false);
    }
  }

  const activeCount = (rules ?? []).filter((r) => r.isActive).length;

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Header */}
        <section className="rounded-xl border border-sky-200 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-600 uppercase">
                Risk &amp; Governance
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Discount Rules
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Configure maximum discount ceilings per customer tier and product category.
                The risk engine uses these to flag quotations that exceed allowed thresholds.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}
                className="border-sky-200 bg-white text-slate-800 hover:bg-sky-100">
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setShowResolver(!showResolver)}
                className="bg-amber-600 font-medium text-white hover:bg-amber-500">
                <Search className="mr-1.5 h-4 w-4" />
                Resolve Ceiling
              </Button>
              <Button size="sm" onClick={() => setIsCreating(true)}
                className="bg-sky-500 font-medium text-white hover:bg-sky-400">
                <Plus className="mr-1.5 h-4 w-4" />
                New Rule
              </Button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Rules</span>
                <Percent className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{rules?.length ?? "—"}</div>
              <div className="mt-1 text-xs text-slate-500">Configured</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Active Rules</span>
                <ShieldAlert className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{activeCount}</div>
              <div className="mt-1 text-xs text-slate-500">Enforced</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Tier Rules</span>
                <Percent className="h-4 w-4 text-purple-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {(rules ?? []).filter((r) => r.scope === "TIER").length}
              </div>
              <div className="mt-1 text-xs text-slate-500">vs {(rules ?? []).filter((r) => r.scope === "CATEGORY").length} category rules</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-700">{error}</div>
        )}

        {/* Ceiling Resolver */}
        {showResolver && (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
            <h3 className="mb-4 text-sm font-bold text-amber-700 uppercase">Ceiling Resolver</h3>
            <form onSubmit={handleResolve} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Customer Tier</Label>
                  <select value={resolveTierId} onChange={(e) => setResolveTierId(e.target.value)}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900" required>
                    {(tiers ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Category (optional)</Label>
                  <select value={resolveCategoryId} onChange={(e) => setResolveCategoryId(e.target.value)}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="">All categories</option>
                    {(categories ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={resolving} size="sm"
                className="bg-amber-600 text-white hover:bg-amber-500">
                {resolving ? "Resolving..." : "Resolve"}
              </Button>
            </form>
            {resolveResult && (
              <div className="mt-4 rounded-lg border border-amber-400/30 bg-sky-50 p-4 space-y-1">
                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">Allowed Discount:</span>{" "}
                  {resolveResult.allowedDiscountPct ? `${resolveResult.allowedDiscountPct}%` : "No ceiling configured"}
                </p>
                <p className="text-xs text-slate-500">
                  Tier ceiling: {resolveResult.tierCeilingPct ?? "—"}% · Category ceiling: {resolveResult.categoryCeilingPct ?? "—"}%
                </p>
                <p className="text-xs text-slate-500">Limiting scope: {resolveResult.limitingScope}</p>
              </div>
            )}
          </section>
        )}

        {/* Rules Table */}
        <section className="rounded-xl border border-sky-100 bg-white p-6 shadow-xl">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading rules...</div>
          ) : (rules ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No discount rules configured.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-sky-100 hover:bg-transparent">
                    <TableHead className="text-slate-600">Scope</TableHead>
                    <TableHead className="text-slate-600">Tier / Category</TableHead>
                    <TableHead className="text-slate-600">Max Discount</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-slate-600">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rules ?? []).map((rule) => (
                    <TableRow key={rule.id} className="border-sky-100 transition-colors hover:bg-sky-50">
                      <TableCell>
                        <Badge className={`border text-xs ${rule.scope === "TIER" ? "border-purple-400/30 bg-purple-400/10 text-purple-700" : "border-cyan-400/30 bg-cyan-400/10 text-cyan-700"}`}>
                          {rule.scope}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-900 font-medium">
                        {rule.scope === "TIER"
                          ? rule.tier?.name ?? "—"
                          : rule.category?.name ?? "—"}
                      </TableCell>
                      <TableCell className="font-semibold text-amber-700">
                        {Number(rule.maxDiscountPct).toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <Badge className={`border text-xs ${rule.isActive ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-600"}`}>
                          {rule.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
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
          <Card className="w-full max-w-lg border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="border-b border-sky-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900">Create Discount Rule</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">{createError}</div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Scope</Label>
                  <select value={newScope} onChange={(e) => setNewScope(e.target.value as "TIER" | "CATEGORY")}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="TIER">TIER</option>
                    <option value="CATEGORY">CATEGORY</option>
                  </select>
                </div>
                {newScope === "TIER" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Customer Tier</Label>
                    <select value={newTierId} onChange={(e) => setNewTierId(e.target.value)}
                      className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900" required>
                      {(tiers ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Product Category</Label>
                    <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}
                      className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900" required>
                      {(categories ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Max Discount (%)</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={newMaxPct}
                    onChange={(e) => setNewMaxPct(e.target.value)}
                    className="border-sky-100 bg-white text-slate-900" required />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreating(false)}
                    className="border-sky-100 text-slate-600 hover:bg-white">Cancel</Button>
                  <Button type="submit" disabled={createSubmitting}
                    className="bg-sky-500 font-semibold text-white hover:bg-sky-400">
                    {createSubmitting ? "Creating..." : "Create Rule"}
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
