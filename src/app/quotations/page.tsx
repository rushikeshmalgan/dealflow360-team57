"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  DollarSign,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { NegotiationPanel } from "@/components/negotiation-panel";
import { RecommendationPane } from "@/components/recommendations/recommendation-pane";
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
import {
  addRecommendationToQuote,
  dismissRecommendation,
  fetchRecommendations,
  type RecommendationViewModel,
} from "@/lib/recommendations";
import type { CustomerDto } from "@/modules/customers/application/types";
import type { PriceListDto } from "@/modules/pricing/application/types";
import type {
  QuotationDto,
  QuotationStatus,
  SubmitQuotationResult,
} from "@/modules/quotation/application/types";

type ProductDto = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  price: string;
  variants: Array<{ id: string; attribute: string; value: string }>;
};

const STATUS_VARIANTS: Record<
  QuotationStatus,
  { badgeClass: string }
> = {
  DRAFT: { badgeClass: "border-slate-300 bg-slate-100 text-slate-800" },
  SUBMITTED: { badgeClass: "border-sky-400/30 bg-sky-400/10 text-sky-700" },
  PENDING_APPROVAL: { badgeClass: "border-amber-400/30 bg-amber-400/10 text-amber-700" },
  APPROVED: { badgeClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700" },
  REJECTED: { badgeClass: "border-rose-400/30 bg-rose-400/10 text-rose-700" },
  SENT_TO_CUSTOMER: { badgeClass: "border-cyan-400/30 bg-cyan-400/10 text-cyan-700" },
  UNDER_NEGOTIATION: { badgeClass: "border-violet-400/30 bg-violet-400/10 text-violet-700" },
  RE_APPROVAL_REQUIRED: { badgeClass: "border-orange-400/30 bg-orange-400/10 text-orange-700" },
  CONFIRMED: { badgeClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700" },
  FULFILLMENT: { badgeClass: "border-blue-400/30 bg-blue-400/10 text-blue-200" },
  BILLING: { badgeClass: "border-indigo-400/30 bg-indigo-400/10 text-indigo-700" },
  COMPLETED: { badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" },
};

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<QuotationDto[] | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [priceLists, setPriceLists] = useState<PriceListDto[] | null>(null);
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Create modal
  const [isCreating, setIsCreating] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newPriceListId, setNewPriceListId] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Detail modal
  const [selectedQuote, setSelectedQuote] = useState<QuotationDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add line
  const [addingLine, setAddingLine] = useState(false);
  const [lineProductId, setLineProductId] = useState("");
  const [lineVariantId, setLineVariantId] = useState<string | null>(null);
  const [lineQuantity, setLineQuantity] = useState("1");
  const [lineBillingType, setLineBillingType] = useState<"ONE_TIME" | "RECURRING">("ONE_TIME");
  const [addLineSubmitting, setAddLineSubmitting] = useState(false);
  const [addLineError, setAddLineError] = useState<string | null>(null);

  // Submit result
  const [submitResult, setSubmitResult] = useState<SubmitQuotationResult | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [quoteRes, custRes, plRes, prodRes] = await Promise.all([
        apiRequest<QuotationDto[]>("/api/quotations"),
        apiRequest<CustomerDto[]>("/api/customers").catch(() => []),
        apiRequest<PriceListDto[]>("/api/price-lists").catch(() => []),
        apiRequest<ProductDto[]>("/api/products").catch(() => []),
      ]);
      setQuotations(quoteRes);
      setCustomers(custRes);
      setPriceLists(plRes);
      setProducts(prodRes);
      if (custRes.length > 0 && !newCustomerId) {
        const firstCustomer = custRes[0];
        setNewCustomerId(firstCustomer.id);
        const match = plRes.find((pl) => pl.tier.id === firstCustomer.tier.id);
        setNewPriceListId(match?.id ?? "");
      }
      if (prodRes.length > 0 && !lineProductId) setLineProductId(prodRes[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load quotations.");
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
      await apiRequest("/api/quotations", {
        method: "POST",
        body: JSON.stringify({
          customerId: newCustomerId,
          priceListId: newPriceListId,
        }),
      });
      setIsCreating(false);
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create quotation.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleOpenDetail(id: string) {
    setDetailLoading(true);
    setSubmitResult(null);
    setAddLineError(null);
    try {
      const quote = await apiRequest<QuotationDto>(`/api/quotations/${id}`);
      setSelectedQuote(quote);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load quotation detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedQuote) return;
    setAddLineSubmitting(true);
    setAddLineError(null);
    try {
      await apiRequest(`/api/quotations/${selectedQuote.id}/lines`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: selectedQuote.version,
          productId: lineProductId,
          variantId: lineVariantId || null,
          quantity: Number(lineQuantity) || 1,
          billingType: lineBillingType,
        }),
      });
      setAddingLine(false);
      setLineQuantity("1");
      await handleOpenDetail(selectedQuote.id);
      await loadData();
    } catch (err) {
      setAddLineError(err instanceof ApiClientError ? err.message : "Failed to add line.");
    } finally {
      setAddLineSubmitting(false);
    }
  }

  async function handleRemoveLine(lineId: string) {
    if (!selectedQuote) return;
    try {
      await apiRequest(`/api/quotations/${selectedQuote.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: selectedQuote.version,
          removeLineId: lineId,
        }),
      });
      await handleOpenDetail(selectedQuote.id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to remove line.");
    }
  }

  async function handleAddRecommendationToQuote(recommendation: RecommendationViewModel) {
    if (!selectedQuote) return;
    await addRecommendationToQuote(recommendation.id, selectedQuote.version);
    await handleOpenDetail(selectedQuote.id);
    await loadData();
  }

  async function handleDismissRecommendation(recommendation: RecommendationViewModel) {
    await dismissRecommendation(recommendation.id);
  }

  async function handleSubmitQuotation() {
    if (!selectedQuote) return;
    try {
      const result = await apiRequest<SubmitQuotationResult>(
        `/api/quotations/${selectedQuote.id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: selectedQuote.version }),
        },
      );
      setSubmitResult(result);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to submit quotation.");
    }
  }

  async function handleUpdateLineDiscount(lineId: string, pct: number) {
    if (!selectedQuote) return;
    try {
      await apiRequest(`/api/quotations/${selectedQuote.id}/discounts`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: selectedQuote.version,
          lineDiscounts: [{ lineId, lineDiscountPct: pct }],
        }),
      });
      await handleOpenDetail(selectedQuote.id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update line discount.");
    }
  }

  async function handleUpdateOrderDiscount(pct: number) {
    if (!selectedQuote) return;
    try {
      await apiRequest(`/api/quotations/${selectedQuote.id}/discounts`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: selectedQuote.version, orderDiscountPct: pct }),
      });
      await handleOpenDetail(selectedQuote.id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update order discount.");
    }
  }

  async function handleUpdateQuantity(lineId: string, quantity: number) {
    if (!selectedQuote || quantity < 1) return;
    try {
      await apiRequest(`/api/quotations/${selectedQuote.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: selectedQuote.version,
          updateLineQuantity: { lineId, quantity },
        }),
      });
      await handleOpenDetail(selectedQuote.id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update quantity.");
    }
  }

  // The customer's tier fixes which price lists are even legal to quote against (backend
  // enforces this — see prisma-quotation-repository.ts's "price list does not match this
  // customer's tier" check); scoping the dropdown here means the create form can never even
  // offer a combination the API would reject.
  const selectedNewCustomer = (customers ?? []).find((c) => c.id === newCustomerId);
  const compatiblePriceLists = (priceLists ?? []).filter(
    (pl) => pl.tier.id === selectedNewCustomer?.tier.id,
  );

  function handleNewCustomerChange(customerId: string) {
    setNewCustomerId(customerId);
    const customer = (customers ?? []).find((c) => c.id === customerId);
    const match = (priceLists ?? []).find((pl) => pl.tier.id === customer?.tier.id);
    setNewPriceListId(match?.id ?? "");
  }

  // A price list only has resolvable prices for products explicitly listed in it (T2.3) — this
  // is exactly the "No active price can be resolved for this selection" error otherwise.
  const activePriceList = (priceLists ?? []).find((pl) => pl.id === selectedQuote?.priceList.id);
  const priceableProductIds = new Set((activePriceList?.items ?? []).map((i) => i.productId));
  const availableProducts = (products ?? []).filter((p) => priceableProductIds.has(p.id));

  function handleOpenAddLine() {
    setAddLineError(null);
    if (availableProducts.length > 0 && !priceableProductIds.has(lineProductId)) {
      setLineProductId(availableProducts[0].id);
      setLineVariantId(null);
    }
    setAddingLine(true);
  }

  const filteredQuotes = (quotations ?? []).filter((q) => {
    if (statusFilter === "ALL") return true;
    return q.status === statusFilter;
  });

  const allStatuses: QuotationStatus[] = [
    "DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED",
    "SENT_TO_CUSTOMER", "UNDER_NEGOTIATION", "CONFIRMED", "FULFILLMENT",
    "BILLING", "COMPLETED",
  ];

  const pipelineTotal = (quotations ?? [])
    .filter((q) => !["REJECTED", "COMPLETED"].includes(q.status))
    .reduce((sum, q) => sum + Number(q.summary.netBeforeTax), 0);

  const draftCount = (quotations ?? []).filter((q) => q.status === "DRAFT").length;
  const pendingCount = (quotations ?? []).filter((q) => q.status === "PENDING_APPROVAL").length;

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Header */}
        <section className="rounded-xl border border-sky-200 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-600 uppercase">
                Sales Workspace
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Quotation Pipeline
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Build, review and move customer quotes through the approval chain.
                Create quotations, add line items, apply discounts, and submit for approval.
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
                New Quotation
              </Button>
            </div>
          </div>

          {/* Metrics */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Open Pipeline</span>
                <DollarSign className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                ${pipelineTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 text-xs text-slate-500">Across active deals</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Draft Quotations</span>
                <FileText className="h-4 w-4 text-slate-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{draftCount}</div>
              <div className="mt-1 text-xs text-slate-500">Awaiting submission</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Pending Approval</span>
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{pendingCount}</div>
              <div className="mt-1 text-xs text-slate-500">In approval chain</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Filter bar + Table */}
        <section className="rounded-xl border border-sky-100 bg-white p-6 shadow-xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-sky-100 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === "ALL"
                    ? "bg-sky-500 text-white"
                    : "bg-sky-50 text-slate-600 hover:bg-sky-100"
                }`}
              >
                ALL
              </button>
              {allStatuses.map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter === st
                      ? "bg-sky-500 text-white"
                      : "bg-sky-50 text-slate-600 hover:bg-sky-100"
                  }`}
                >
                  {st.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500">
              Showing {filteredQuotes.length} quotation{filteredQuotes.length === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading quotations...</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No quotations match the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-sky-100 hover:bg-transparent">
                    <TableHead className="text-slate-600">Code</TableHead>
                    <TableHead className="text-slate-600">Customer</TableHead>
                    <TableHead className="text-slate-600">Lines</TableHead>
                    <TableHead className="text-slate-600">Net Amount</TableHead>
                    <TableHead className="text-slate-600">Margin</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-right text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotes.map((q) => {
                    const statusMeta = STATUS_VARIANTS[q.status] ?? STATUS_VARIANTS.DRAFT;
                    return (
                      <TableRow
                        key={q.id}
                        className="border-sky-100 transition-colors hover:bg-sky-50"
                      >
                        <TableCell className="font-mono text-xs font-bold text-sky-700">
                          {q.code}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">
                          {q.customer.name}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {q.lines.length} line{q.lines.length === 1 ? "" : "s"}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          ${Number(q.summary.netBeforeTax).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {q.summary.marginPct ? `${Number(q.summary.marginPct).toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`border px-2 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}>
                            {q.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDetail(q.id)}
                            className="border-sky-100 bg-sky-50 text-xs text-slate-800 hover:bg-sky-100"
                          >
                            <ArrowRight className="mr-1 h-3.5 w-3.5 text-sky-600" />
                            View
                          </Button>
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

      {/* Create Quotation Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-lg border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="border-b border-sky-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900">
                Create New Quotation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">
                    {createError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Customer</Label>
                  <select
                    value={newCustomerId}
                    onChange={(e) => handleNewCustomerChange(e.target.value)}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
                    required
                  >
                    {(customers ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.tier.name})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Price List</Label>
                  <select
                    value={newPriceListId}
                    onChange={(e) => setNewPriceListId(e.target.value)}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
                    required
                    disabled={compatiblePriceLists.length === 0}
                  >
                    {compatiblePriceLists.length === 0 && <option value="">No price list for this tier</option>}
                    {compatiblePriceLists.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name} ({pl.currency}) — {pl.tier.name}
                      </option>
                    ))}
                  </select>
                  {compatiblePriceLists.length === 0 && (
                    <p className="text-[11px] text-amber-600">
                      No active price list is configured for {selectedNewCustomer?.tier.name ?? "this"} tier yet —
                      create one on the Price Lists page first.
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreating(false)}
                    className="border-sky-100 text-slate-600 hover:bg-white">Cancel</Button>
                  <Button type="submit" disabled={createSubmitting || !newPriceListId}
                    className="bg-sky-500 font-semibold text-white hover:bg-sky-400">
                    {createSubmitting ? "Creating..." : "Create Quotation"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detail Modal */}
      {(selectedQuote || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-sky-100 pb-4">
              <div>
                <span className="text-xs font-semibold text-sky-600 uppercase">Quotation Detail</span>
                <CardTitle className="text-lg font-bold text-slate-900">
                  {selectedQuote?.code ?? "Loading..."}
                </CardTitle>
                {selectedQuote && (
                  <p className="text-xs text-slate-500">
                    {selectedQuote.customer.name} · {selectedQuote.priceList.currency} · v{selectedQuote.version}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedQuote(null); setSubmitResult(null); }}
                className="text-slate-500 hover:text-slate-900">✕</Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              {detailLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
              ) : selectedQuote ? (
                <>
                  {/* Submit result */}
                  {submitResult && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                      <div className="flex items-center text-sm font-semibold text-emerald-700">
                        <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                        Quotation Submitted
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Risk band: {submitResult.risk.band} (score: {submitResult.risk.score}) ·
                        {submitResult.requiresApproval
                          ? ` Routed to ${submitResult.approvalSteps.map((s) => s.role).join(", ")}`
                          : " Auto-approved"}
                      </p>
                    </div>
                  )}

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500">Status:</span>
                    <Badge className={`border px-2 py-0.5 text-xs font-semibold ${STATUS_VARIANTS[selectedQuote.status]?.badgeClass ?? ""}`}>
                      {selectedQuote.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      Net: ${Number(selectedQuote.summary.netBeforeTax).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-slate-500">
                      Margin: {selectedQuote.summary.marginPct ? `${Number(selectedQuote.summary.marginPct).toFixed(1)}%` : "—"}
                    </span>
                  </div>

                  {/* Negotiation panel (T12.2/T12.4's internal counterpart) */}
                  {selectedQuote.status === "UNDER_NEGOTIATION" && (
                    <NegotiationPanel
                      quotationId={selectedQuote.id}
                      onResolved={async () => {
                        await handleOpenDetail(selectedQuote.id);
                        await loadData();
                      }}
                    />
                  )}

                  {/* Lines */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                        Line Items ({selectedQuote.lines.length})
                      </h3>
                      {selectedQuote.status === "DRAFT" && (
                        <Button size="sm" onClick={handleOpenAddLine}
                          className="bg-sky-500 text-xs text-white hover:bg-sky-400">
                          <Plus className="mr-1 h-3 w-3" /> Add Line
                        </Button>
                      )}
                    </div>
                    {selectedQuote.status === "DRAFT" && activePriceList && availableProducts.length === 0 && (
                      <p className="rounded border border-amber-700/40 bg-amber-950/20 p-2 text-[11px] text-amber-700">
                        This price list ({activePriceList.name}) has no priced products yet — add items to it on
                        the Price Lists page before adding lines here.
                      </p>
                    )}
                    {selectedQuote.status === "DRAFT" && selectedQuote.lines.length > 0 && (
                      <div className="flex items-center gap-2 rounded border border-sky-100 bg-sky-50 p-2">
                        <Label className="text-xs text-slate-600 shrink-0">Order-level discount %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          defaultValue={selectedQuote.orderDiscountPct}
                          key={`${selectedQuote.id}-${selectedQuote.version}-order-discount`}
                          onBlur={(e) => {
                            const pct = Number(e.target.value);
                            if (!Number.isNaN(pct) && pct !== Number(selectedQuote.orderDiscountPct)) {
                              handleUpdateOrderDiscount(pct);
                            }
                          }}
                          className="h-7 w-24 border-sky-100 bg-white text-xs text-slate-900"
                        />
                        <span className="text-[11px] text-slate-500">
                          Applies on top of each line&apos;s own discount (combined sequentially).
                        </span>
                      </div>
                    )}
                    {selectedQuote.lines.length === 0 ? (
                      <p className="rounded border border-sky-100 bg-white p-3 text-xs text-slate-500">
                        No line items yet. Add products to this quotation.
                      </p>
                    ) : (
                      <div className="rounded-lg border border-sky-100 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-sky-100 bg-sky-50">
                              <TableHead className="text-xs text-slate-600">Product</TableHead>
                              <TableHead className="text-xs text-slate-600">Qty</TableHead>
                              <TableHead className="text-xs text-slate-600">Unit Price</TableHead>
                              <TableHead className="text-xs text-slate-600">Discount</TableHead>
                              <TableHead className="text-xs text-slate-600">Type</TableHead>
                              <TableHead className="text-right text-xs text-slate-600">Net</TableHead>
                              {selectedQuote.status === "DRAFT" && (
                                <TableHead className="text-right text-xs text-slate-600"></TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedQuote.lines.map((line) => (
                              <TableRow key={line.id} className="border-sky-100">
                                <TableCell className="text-xs font-medium text-slate-900">
                                  {line.product.name}
                                  {line.variant && (
                                    <span className="ml-1 text-slate-500">({line.variant.value})</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-slate-600">
                                  {selectedQuote.status === "DRAFT" ? (
                                    <Input
                                      type="number"
                                      min="1"
                                      defaultValue={line.quantity}
                                      key={`${line.id}-${selectedQuote.version}-qty`}
                                      onBlur={(e) => {
                                        const qty = Number(e.target.value);
                                        if (Number.isInteger(qty) && qty > 0 && qty !== line.quantity) {
                                          handleUpdateQuantity(line.id, qty);
                                        }
                                      }}
                                      className="h-7 w-16 border-sky-100 bg-white text-xs text-slate-900"
                                    />
                                  ) : (
                                    line.quantity
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-slate-600">${line.unitPrice}</TableCell>
                                <TableCell className="text-xs text-slate-600">
                                  {selectedQuote.status === "DRAFT" ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        defaultValue={line.lineDiscountPct}
                                        key={`${line.id}-${selectedQuote.version}-discount`}
                                        onBlur={(e) => {
                                          const pct = Number(e.target.value);
                                          if (!Number.isNaN(pct) && pct !== Number(line.lineDiscountPct)) {
                                            handleUpdateLineDiscount(line.id, pct);
                                          }
                                        }}
                                        className="h-7 w-16 border-sky-100 bg-white text-xs text-slate-900"
                                      />
                                      <span className="text-slate-500">%</span>
                                    </div>
                                  ) : (
                                    `${Number(line.effectiveDiscountPct).toFixed(1)}%`
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] ${line.billingType === "RECURRING" ? "border-purple-400/30 bg-purple-400/10 text-purple-700" : "border-slate-300 bg-slate-100 text-slate-800"}`}>
                                    {line.billingType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-xs font-semibold text-emerald-600">
                                  ${line.netBeforeTax}
                                </TableCell>
                                {selectedQuote.status === "DRAFT" && (
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => handleRemoveLine(line.id)}
                                      className="text-rose-600 hover:text-rose-700 h-6 w-6 p-0">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Upsell / Cross-Sell */}
                  {selectedQuote.status === "DRAFT" && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                        Upsell &amp; Cross-Sell
                      </h3>
                      <RecommendationPane
                        quotationId={selectedQuote.id}
                        fetcher={fetchRecommendations}
                        onAddToQuote={handleAddRecommendationToQuote}
                        onDismiss={handleDismissRecommendation}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  {selectedQuote.status === "DRAFT" && selectedQuote.lines.length > 0 && !submitResult && (
                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSubmitQuotation}
                        className="bg-emerald-600 font-semibold text-white hover:bg-emerald-500">
                        <Send className="mr-1.5 h-4 w-4" />
                        Submit for Approval
                      </Button>
                    </div>
                  )}

                  {/* Add Line Form */}
                  {addingLine && (
                    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
                      <h4 className="mb-3 text-xs font-bold text-sky-700 uppercase">Add Line Item</h4>
                      <form onSubmit={handleAddLine} className="space-y-3">
                        {addLineError && (
                          <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">
                            {addLineError}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">Product</Label>
                            <select value={lineProductId} onChange={(e) => { setLineProductId(e.target.value); setLineVariantId(null); }}
                              className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900">
                              {availableProducts.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                              ))}
                            </select>
                            <p className="text-[11px] text-slate-500">
                              Only products priced in {activePriceList?.name ?? "this price list"} are shown.
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">Variant (optional)</Label>
                            <select value={lineVariantId ?? ""} onChange={(e) => setLineVariantId(e.target.value || null)}
                              className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900">
                              <option value="">None</option>
                              {(products ?? []).find((p) => p.id === lineProductId)?.variants?.map((v) => (
                                <option key={v.id} value={v.id}>{v.attribute}: {v.value}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">Quantity</Label>
                            <Input type="number" min="1" value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)}
                              className="border-sky-100 bg-white text-slate-900" required />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">Billing Type</Label>
                            <select value={lineBillingType} onChange={(e) => setLineBillingType(e.target.value as "ONE_TIME" | "RECURRING")}
                              className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900">
                              <option value="ONE_TIME">ONE_TIME</option>
                              <option value="RECURRING">RECURRING</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setAddingLine(false)}
                            className="border-sky-100 text-slate-600">Cancel</Button>
                          <Button type="submit" size="sm" disabled={addLineSubmitting || availableProducts.length === 0}
                            className="bg-sky-500 text-white hover:bg-sky-400">
                            {addLineSubmitting ? "Adding..." : "Add Line"}
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
