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
  DRAFT: { badgeClass: "border-slate-400/30 bg-slate-400/10 text-slate-200" },
  SUBMITTED: { badgeClass: "border-sky-400/30 bg-sky-400/10 text-sky-200" },
  PENDING_APPROVAL: { badgeClass: "border-amber-400/30 bg-amber-400/10 text-amber-200" },
  APPROVED: { badgeClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
  REJECTED: { badgeClass: "border-rose-400/30 bg-rose-400/10 text-rose-200" },
  SENT_TO_CUSTOMER: { badgeClass: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
  UNDER_NEGOTIATION: { badgeClass: "border-violet-400/30 bg-violet-400/10 text-violet-200" },
  RE_APPROVAL_REQUIRED: { badgeClass: "border-orange-400/30 bg-orange-400/10 text-orange-200" },
  CONFIRMED: { badgeClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
  FULFILLMENT: { badgeClass: "border-blue-400/30 bg-blue-400/10 text-blue-200" },
  BILLING: { badgeClass: "border-indigo-400/30 bg-indigo-400/10 text-indigo-200" },
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
      if (custRes.length > 0 && !newCustomerId) setNewCustomerId(custRes[0].id);
      if (plRes.length > 0 && !newPriceListId) setNewPriceListId(plRes[0].id);
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
    <div className="min-h-screen bg-[#171b22] text-slate-100">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Header */}
        <section className="rounded-xl border border-slate-600/60 bg-[#232a34] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-400 uppercase">
                Sales Workspace
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Quotation Pipeline
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
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
                className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
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
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Open Pipeline</span>
                <DollarSign className="h-4 w-4 text-sky-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                ${pipelineTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 text-xs text-slate-400">Across active deals</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Draft Quotations</span>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{draftCount}</div>
              <div className="mt-1 text-xs text-slate-400">Awaiting submission</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Pending Approval</span>
                <CheckCircle2 className="h-4 w-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{pendingCount}</div>
              <div className="mt-1 text-xs text-slate-400">In approval chain</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Filter bar + Table */}
        <section className="rounded-xl border border-slate-700/60 bg-[#232a34] p-6 shadow-xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === "ALL"
                    ? "bg-sky-500 text-white"
                    : "bg-[#1c222b] text-slate-300 hover:bg-slate-700/60"
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
                      : "bg-[#1c222b] text-slate-300 hover:bg-slate-700/60"
                  }`}
                >
                  {st.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-400">
              Showing {filteredQuotes.length} quotation{filteredQuotes.length === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading quotations...</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No quotations match the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Code</TableHead>
                    <TableHead className="text-slate-300">Customer</TableHead>
                    <TableHead className="text-slate-300">Lines</TableHead>
                    <TableHead className="text-slate-300">Net Amount</TableHead>
                    <TableHead className="text-slate-300">Margin</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotes.map((q) => {
                    const statusMeta = STATUS_VARIANTS[q.status] ?? STATUS_VARIANTS.DRAFT;
                    return (
                      <TableRow
                        key={q.id}
                        className="border-slate-800 transition-colors hover:bg-slate-800/50"
                      >
                        <TableCell className="font-mono text-xs font-bold text-sky-300">
                          {q.code}
                        </TableCell>
                        <TableCell className="font-medium text-white">
                          {q.customer.name}
                        </TableCell>
                        <TableCell className="text-slate-300">
                          {q.lines.length} line{q.lines.length === 1 ? "" : "s"}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-100">
                          ${Number(q.summary.netBeforeTax).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-slate-300">
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
                            className="border-slate-700 bg-slate-800/80 text-xs text-slate-200 hover:bg-slate-700"
                          >
                            <ArrowRight className="mr-1 h-3.5 w-3.5 text-sky-400" />
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
          <Card className="w-full max-w-lg border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white">
                Create New Quotation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                    {createError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Customer</Label>
                  <select
                    value={newCustomerId}
                    onChange={(e) => setNewCustomerId(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100"
                    required
                  >
                    {(customers ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Price List</Label>
                  <select
                    value={newPriceListId}
                    onChange={(e) => setNewPriceListId(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100"
                    required
                  >
                    {(priceLists ?? []).map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name} ({pl.currency}) — {pl.tier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreating(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
                  <Button type="submit" disabled={createSubmitting}
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
          <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-700/60 pb-4">
              <div>
                <span className="text-xs font-semibold text-sky-400 uppercase">Quotation Detail</span>
                <CardTitle className="text-lg font-bold text-white">
                  {selectedQuote?.code ?? "Loading..."}
                </CardTitle>
                {selectedQuote && (
                  <p className="text-xs text-slate-400">
                    {selectedQuote.customer.name} · {selectedQuote.priceList.currency} · v{selectedQuote.version}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedQuote(null); setSubmitResult(null); }}
                className="text-slate-400 hover:text-white">✕</Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              {detailLoading ? (
                <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
              ) : selectedQuote ? (
                <>
                  {/* Submit result */}
                  {submitResult && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                      <div className="flex items-center text-sm font-semibold text-emerald-200">
                        <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-400" />
                        Quotation Submitted
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        Risk band: {submitResult.risk.band} (score: {submitResult.risk.score}) ·
                        {submitResult.requiresApproval
                          ? ` Routed to ${submitResult.approvalSteps.map((s) => s.role).join(", ")}`
                          : " Auto-approved"}
                      </p>
                    </div>
                  )}

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-400">Status:</span>
                    <Badge className={`border px-2 py-0.5 text-xs font-semibold ${STATUS_VARIANTS[selectedQuote.status]?.badgeClass ?? ""}`}>
                      {selectedQuote.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      Net: ${Number(selectedQuote.summary.netBeforeTax).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-slate-400">
                      Margin: {selectedQuote.summary.marginPct ? `${Number(selectedQuote.summary.marginPct).toFixed(1)}%` : "—"}
                    </span>
                  </div>

                  {/* Lines */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                        Line Items ({selectedQuote.lines.length})
                      </h3>
                      {selectedQuote.status === "DRAFT" && (
                        <Button size="sm" onClick={() => setAddingLine(true)}
                          className="bg-sky-500 text-xs text-white hover:bg-sky-400">
                          <Plus className="mr-1 h-3 w-3" /> Add Line
                        </Button>
                      )}
                    </div>
                    {selectedQuote.lines.length === 0 ? (
                      <p className="rounded border border-slate-800 bg-[#232a34] p-3 text-xs text-slate-400">
                        No line items yet. Add products to this quotation.
                      </p>
                    ) : (
                      <div className="rounded-lg border border-slate-700 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-800 bg-slate-800/40">
                              <TableHead className="text-xs text-slate-300">Product</TableHead>
                              <TableHead className="text-xs text-slate-300">Qty</TableHead>
                              <TableHead className="text-xs text-slate-300">Unit Price</TableHead>
                              <TableHead className="text-xs text-slate-300">Discount</TableHead>
                              <TableHead className="text-xs text-slate-300">Type</TableHead>
                              <TableHead className="text-right text-xs text-slate-300">Net</TableHead>
                              {selectedQuote.status === "DRAFT" && (
                                <TableHead className="text-right text-xs text-slate-300"></TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedQuote.lines.map((line) => (
                              <TableRow key={line.id} className="border-slate-800">
                                <TableCell className="text-xs font-medium text-white">
                                  {line.product.name}
                                  {line.variant && (
                                    <span className="ml-1 text-slate-400">({line.variant.value})</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-slate-300">{line.quantity}</TableCell>
                                <TableCell className="text-xs text-slate-300">${line.unitPrice}</TableCell>
                                <TableCell className="text-xs text-slate-300">{Number(line.effectiveDiscountPct).toFixed(1)}%</TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] ${line.billingType === "RECURRING" ? "border-purple-400/30 bg-purple-400/10 text-purple-200" : "border-slate-400/30 bg-slate-400/10 text-slate-200"}`}>
                                    {line.billingType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-xs font-semibold text-emerald-400">
                                  ${line.netBeforeTax}
                                </TableCell>
                                {selectedQuote.status === "DRAFT" && (
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => handleRemoveLine(line.id)}
                                      className="text-rose-400 hover:text-rose-300 h-6 w-6 p-0">
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
                      <h3 className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                        Upsell &amp; Cross-Sell
                      </h3>
                      <RecommendationPane quotationId={selectedQuote.id} />
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
                      <h4 className="mb-3 text-xs font-bold text-sky-300 uppercase">Add Line Item</h4>
                      <form onSubmit={handleAddLine} className="space-y-3">
                        {addLineError && (
                          <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                            {addLineError}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Product</Label>
                            <select value={lineProductId} onChange={(e) => { setLineProductId(e.target.value); setLineVariantId(null); }}
                              className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                              {(products ?? []).map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Variant (optional)</Label>
                            <select value={lineVariantId ?? ""} onChange={(e) => setLineVariantId(e.target.value || null)}
                              className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                              <option value="">None</option>
                              {(products ?? []).find((p) => p.id === lineProductId)?.variants?.map((v) => (
                                <option key={v.id} value={v.id}>{v.attribute}: {v.value}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Quantity</Label>
                            <Input type="number" min="1" value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)}
                              className="border-slate-700 bg-[#232a34] text-slate-100" required />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Billing Type</Label>
                            <select value={lineBillingType} onChange={(e) => setLineBillingType(e.target.value as "ONE_TIME" | "RECURRING")}
                              className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                              <option value="ONE_TIME">ONE_TIME</option>
                              <option value="RECURRING">RECURRING</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setAddingLine(false)}
                            className="border-slate-700 text-slate-300">Cancel</Button>
                          <Button type="submit" size="sm" disabled={addLineSubmitting}
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
