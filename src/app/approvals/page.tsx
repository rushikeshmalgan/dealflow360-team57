"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ApprovalQueueItemDto, ApprovalRuleDto } from "@/modules/approval/application/types";

const RISK_BAND_COLORS: Record<string, string> = {
  LOW: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  MEDIUM: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  HIGH: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

export default function ApprovalsPage() {
  const { user: me } = useCurrentUser();
  const canDecide = me?.role === "MANAGER" || me?.role === "FINANCE_OPS" || me?.role === "ADMIN";

  const [rules, setRules] = useState<ApprovalRuleDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pending Approvals queue (T8.2/T8.3)
  const [queue, setQueue] = useState<ApprovalQueueItemDto[] | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  async function loadQueue() {
    if (!canDecide) return;
    setQueueLoading(true);
    setQueueError(null);
    try {
      setQueue(await apiRequest<ApprovalQueueItemDto[]>("/api/approvals/queue"));
    } catch (err) {
      setQueueError(err instanceof ApiClientError ? err.message : "Failed to load approval queue.");
    } finally {
      setQueueLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDecide]);

  async function handleDecision(item: ApprovalQueueItemDto, action: "APPROVE" | "REJECT" | "RETURN") {
    setDecidingId(item.id);
    setQueueError(null);
    try {
      await apiRequest(`/api/approvals/${item.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          action,
          reason: reasonById[item.id]?.trim() || undefined,
          expectedVersion: item.version,
        }),
      });
      await loadQueue();
    } catch (err) {
      setQueueError(err instanceof ApiClientError ? err.message : "Failed to record decision.");
    } finally {
      setDecidingId(null);
    }
  }

  // Create modal
  const [isCreating, setIsCreating] = useState(false);
  const [newRiskBand, setNewRiskBand] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [newSteps, setNewSteps] = useState<Array<{ role: "MANAGER" | "FINANCE_OPS" }>>([
    { role: "MANAGER" },
  ]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit modal
  const [editingRule, setEditingRule] = useState<ApprovalRuleDto | null>(null);
  const [editSteps, setEditSteps] = useState<Array<{ role: "MANAGER" | "FINANCE_OPS" }>>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      setRules(await apiRequest<ApprovalRuleDto[]>("/api/approval-rules"));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load approval rules.");
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
      await apiRequest("/api/approval-rules", {
        method: "POST",
        body: JSON.stringify({
          riskBand: newRiskBand,
          steps: newSteps.map((s, i) => ({ stepOrder: i + 1, role: s.role })),
        }),
      });
      setIsCreating(false);
      setNewSteps([{ role: "MANAGER" }]);
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create rule.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openEdit(rule: ApprovalRuleDto) {
    setEditingRule(rule);
    setEditSteps(rule.steps.map((s) => ({ role: s.role })));
    setEditIsActive(rule.isActive);
    setEditError(null);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRule) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await apiRequest(`/api/approval-rules/${editingRule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          isActive: editIsActive,
          steps: editSteps.map((s, i) => ({ stepOrder: i + 1, role: s.role })),
        }),
      });
      setEditingRule(null);
      await loadData();
    } catch (err) {
      setEditError(err instanceof ApiClientError ? err.message : "Failed to update rule.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this approval rule?")) return;
    try {
      await apiRequest(`/api/approval-rules/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to delete rule.");
    }
  }

  return (
    <div className="min-h-screen bg-[#171b22] text-slate-100">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Header */}
        <section className="rounded-xl border border-slate-600/60 bg-[#232a34] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-400 uppercase">
                Governance Center
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Approval Rules
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Configure risk-based approval routing rules. Each risk band (LOW, MEDIUM, HIGH)
                can have a chain of approval steps (Manager → Finance Ops).
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
                New Rule
              </Button>
            </div>
          </div>

          {/* Metrics */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {["LOW", "MEDIUM", "HIGH"].map((band) => {
              const rule = (rules ?? []).find((r) => r.riskBand === band);
              return (
                <div key={band} className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                    <span>{band} Risk</span>
                    <Shield className={`h-4 w-4 ${band === "LOW" ? "text-emerald-400" : band === "MEDIUM" ? "text-amber-400" : "text-rose-400"}`} />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">
                    {rule ? `${rule.steps.length} step${rule.steps.length === 1 ? "" : "s"}` : "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {rule ? (rule.isActive ? "Active" : "Inactive") : "Not configured"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Pending Approvals Queue (T8.2/T8.3) — visible to Manager/Finance Ops/Admin only */}
        {canDecide && (
          <section className="rounded-xl border border-slate-700/60 bg-[#232a34] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
                Pending Approvals — {me?.role.replace("_", " ")} Queue
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={loadQueue}
                disabled={queueLoading}
                className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <RefreshCw className={`mr-1.5 h-4 w-4 ${queueLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {queueError && (
              <div className="mb-4 rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                {queueError}
              </div>
            )}

            {queueLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">Loading queue...</div>
            ) : (queue ?? []).length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                Nothing pending your decision right now.
              </div>
            ) : (
              <div className="space-y-3">
                {(queue ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-sky-400">
                            {item.quotation.code}
                          </span>
                          <Badge className={`border px-2 py-0.5 text-[10px] font-semibold ${RISK_BAND_COLORS[item.riskBand] ?? ""}`}>
                            {item.riskBand} RISK
                          </Badge>
                          <Badge className="border border-slate-500/30 bg-slate-500/10 text-[10px] text-slate-300">
                            Step {item.stepOrder} · {item.role.replace("_", " ")}
                          </Badge>
                          {!item.isActionable && (
                            <Badge className="border border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                              Waiting on earlier step
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.quotation.customer.name} · Rep: {item.quotation.salesRep.email} · $
                          {Number(item.quotation.netBeforeTax).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>

                    {item.isActionable && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                        <input
                          type="text"
                          placeholder="Optional reason / note"
                          value={reasonById[item.id] ?? ""}
                          onChange={(e) => setReasonById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="min-w-[180px] flex-1 rounded-md border border-slate-700 bg-[#232a34] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                        />
                        <Button
                          size="sm"
                          disabled={decidingId === item.id}
                          onClick={() => handleDecision(item, "APPROVE")}
                          className="bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          disabled={decidingId === item.id}
                          onClick={() => handleDecision(item, "RETURN")}
                          variant="outline"
                          className="border-amber-700/50 bg-amber-950/20 text-xs font-semibold text-amber-300 hover:bg-amber-900/40"
                        >
                          <Undo2 className="mr-1 h-3.5 w-3.5" />
                          Return
                        </Button>
                        <Button
                          size="sm"
                          disabled={decidingId === item.id}
                          onClick={() => handleDecision(item, "REJECT")}
                          variant="outline"
                          className="border-rose-900/40 bg-rose-950/20 text-xs font-semibold text-rose-300 hover:bg-rose-900/40"
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Rules Table */}
        <section className="rounded-xl border border-slate-700/60 bg-[#232a34] p-6 shadow-xl">
          <h2 className="mb-4 text-sm font-bold tracking-wider text-slate-300 uppercase">
            Configured Rules
          </h2>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading rules...</div>
          ) : (rules ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No approval rules configured yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Risk Band</TableHead>
                    <TableHead className="text-slate-300">Approval Chain</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Created</TableHead>
                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rules ?? []).map((rule) => (
                    <TableRow
                      key={rule.id}
                      className="border-slate-800 transition-colors hover:bg-slate-800/50"
                    >
                      <TableCell>
                        <Badge className={`border px-2 py-0.5 text-xs font-semibold ${RISK_BAND_COLORS[rule.riskBand] ?? ""}`}>
                          {rule.riskBand}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {rule.steps
                            .sort((a, b) => a.stepOrder - b.stepOrder)
                            .map((step, i) => (
                              <span key={step.id} className="flex items-center gap-1 text-xs text-slate-300">
                                {i > 0 && <span className="text-slate-500">→</span>}
                                <ShieldCheck className="h-3 w-3 text-sky-400" />
                                {step.role === "MANAGER" ? "Manager" : "Finance Ops"}
                              </span>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`border text-xs ${rule.isActive ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-slate-400/30 bg-slate-400/10 text-slate-300"}`}>
                          {rule.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(rule)}
                            className="border-slate-700 bg-slate-800/80 text-xs text-slate-200 hover:bg-slate-700"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(rule.id)}
                            className="border-rose-900/40 bg-rose-950/20 text-xs text-rose-300 hover:bg-rose-900/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
          <Card className="w-full max-w-lg border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white">Create Approval Rule</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                    {createError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Risk Band</Label>
                  <select value={newRiskBand} onChange={(e) => setNewRiskBand(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
                    className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">Approval Steps</Label>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setNewSteps([...newSteps, { role: "FINANCE_OPS" }])}
                      className="border-slate-700 text-xs text-slate-300">
                      + Add Step
                    </Button>
                  </div>
                  {newSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-16">Step {i + 1}</span>
                      <select value={step.role}
                        onChange={(e) => setNewSteps(newSteps.map((s, idx) => idx === i ? { role: e.target.value as "MANAGER" | "FINANCE_OPS" } : s))}
                        className="flex-1 rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                        <option value="MANAGER">Manager</option>
                        <option value="FINANCE_OPS">Finance Ops</option>
                      </select>
                      {newSteps.length > 1 && (
                        <Button type="button" variant="ghost" size="sm"
                          onClick={() => setNewSteps(newSteps.filter((_, idx) => idx !== i))}
                          className="text-rose-400 h-8 w-8 p-0">×</Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreating(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
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

      {/* Edit Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-lg border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white">
                Edit Rule — {editingRule.riskBand}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleUpdate} className="space-y-4">
                {editError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                    {editError}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-slate-300">Active</Label>
                  <button type="button"
                    onClick={() => setEditIsActive(!editIsActive)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${editIsActive ? "bg-emerald-500" : "bg-slate-600"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${editIsActive ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">Approval Steps</Label>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setEditSteps([...editSteps, { role: "FINANCE_OPS" }])}
                      className="border-slate-700 text-xs text-slate-300">+ Add Step</Button>
                  </div>
                  {editSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-16">Step {i + 1}</span>
                      <select value={step.role}
                        onChange={(e) => setEditSteps(editSteps.map((s, idx) => idx === i ? { role: e.target.value as "MANAGER" | "FINANCE_OPS" } : s))}
                        className="flex-1 rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100">
                        <option value="MANAGER">Manager</option>
                        <option value="FINANCE_OPS">Finance Ops</option>
                      </select>
                      {editSteps.length > 1 && (
                        <Button type="button" variant="ghost" size="sm"
                          onClick={() => setEditSteps(editSteps.filter((_, idx) => idx !== i))}
                          className="text-rose-400 h-8 w-8 p-0">×</Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setEditingRule(null)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
                  <Button type="submit" disabled={editSubmitting}
                    className="bg-sky-500 font-semibold text-white hover:bg-sky-400">
                    {editSubmitting ? "Saving..." : "Save Changes"}
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
