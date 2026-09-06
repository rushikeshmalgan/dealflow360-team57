"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MessageSquare, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiClientError, apiRequest } from "@/lib/api-client";

type PendingNegotiation = {
  id: string;
  status: string;
  counterDiscountPct: string | null;
  requestedDeliveryDate: string | null;
  generalComment: string | null;
  lineComments: { id: string; lineId: string | null; comment: string; createdAt: string }[];
  changeRequests: { id: string; lineId: string | null; requestType: string; note: string | null; status: string }[];
  createdAt: string;
};

/**
 * Sales-rep/manager side of a customer's pending negotiation (T12.2/T12.4's missing internal
 * counterpart) — renders inside the quotation detail view whenever status is UNDER_NEGOTIATION,
 * and lets the rep Apply (accept the counter-discount, hand terms back to the customer) or
 * Decline it via POST /api/quotations/{id}/negotiations/{negotiationId}/resolve.
 */
export function NegotiationPanel({
  quotationId,
  onResolved,
}: {
  quotationId: string;
  onResolved: () => void;
}) {
  const [pending, setPending] = useState<PendingNegotiation | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<PendingNegotiation | null>(`/api/quotations/${quotationId}/negotiations/pending`)
      .then((data) => {
        if (!cancelled) setPending(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : "Failed to load negotiation.");
        setPending(null);
      });
    return () => {
      cancelled = true;
    };
  }, [quotationId]);

  async function handleResolve(action: "APPLY" | "DECLINE") {
    if (!pending) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/quotations/${quotationId}/negotiations/${pending.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });
      onResolved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to resolve negotiation.");
    } finally {
      setSubmitting(false);
    }
  }

  if (pending === undefined) {
    return <div className="rounded-lg border border-slate-800 bg-[#232a34] p-3 text-xs text-slate-400">Loading negotiation…</div>;
  }
  if (!pending) return null;

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-200">
        <MessageSquare className="h-4 w-4" />
        Customer Negotiation Request
      </div>

      {error && (
        <div className="mt-2 rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</div>
      )}

      <div className="mt-3 space-y-2 text-xs text-slate-300">
        {pending.counterDiscountPct && (
          <div>
            <span className="font-semibold text-white">Counter-discount requested:</span>{" "}
            {pending.counterDiscountPct}%
          </div>
        )}
        {pending.requestedDeliveryDate && (
          <div>
            <span className="font-semibold text-white">Requested delivery:</span> {pending.requestedDeliveryDate}
          </div>
        )}
        {pending.generalComment && (
          <div>
            <span className="font-semibold text-white">Comment:</span> {pending.generalComment}
          </div>
        )}
        {pending.lineComments.map((c) => (
          <div key={c.id} className="rounded border border-slate-800 bg-[#1c222b] p-2">
            <span className="font-semibold text-white">Line comment:</span> {c.comment}
          </div>
        ))}
        {pending.changeRequests.map((cr) => (
          <div key={cr.id} className="rounded border border-slate-800 bg-[#1c222b] p-2">
            <span className="font-semibold text-white">{cr.requestType.replace(/_/g, " ")}:</span>{" "}
            {cr.note ?? "—"}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
        <input
          type="text"
          placeholder="Optional note to customer"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-w-45 flex-1 rounded-md border border-slate-700 bg-[#232a34] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
        />
        <Button
          size="sm"
          disabled={submitting}
          onClick={() => handleResolve("APPLY")}
          className="bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          Apply &amp; Send Back
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => handleResolve("DECLINE")}
          className="border-rose-900/40 bg-rose-950/20 text-xs font-semibold text-rose-300 hover:bg-rose-900/40"
        >
          <XCircle className="mr-1 h-3.5 w-3.5" />
          Decline
        </Button>
      </div>
      {pending.counterDiscountPct && (
        <p className="mt-2 text-[11px] text-slate-500">
          Applying sets the order discount to {pending.counterDiscountPct}% and returns the quote
          to the customer to confirm.
        </p>
      )}
    </div>
  );
}
