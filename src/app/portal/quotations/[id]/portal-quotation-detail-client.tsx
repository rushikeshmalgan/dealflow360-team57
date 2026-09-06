"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";

import { PortalNav } from "@/components/portal/portal-nav";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type {
  PortalChangeRequestInput,
  PortalConfirmResultDto,
  PortalQuotationDetailDto,
  PortalQuotationStatus,
} from "@/modules/portal/application/types";

const STATUS_BADGE: Record<PortalQuotationStatus, string> = {
  SENT_TO_CUSTOMER: "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-700",
  UNDER_NEGOTIATION: "border-violet-400/30 bg-violet-400/10 text-violet-700 dark:text-violet-700",
  RE_APPROVAL_REQUIRED: "border-orange-400/30 bg-orange-400/10 text-orange-700 dark:text-orange-700",
  CONFIRMED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-700",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100",
};

const STATUS_LABEL: Record<PortalQuotationStatus, string> = {
  SENT_TO_CUSTOMER: "Awaiting your review",
  UNDER_NEGOTIATION: "In negotiation",
  RE_APPROVAL_REQUIRED: "Awaiting internal approval",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
};

const NEGOTIABLE_STATUSES = new Set<PortalQuotationStatus>(["SENT_TO_CUSTOMER", "UNDER_NEGOTIATION"]);

type ChangeRequestDraft = {
  enabled: boolean;
  requestType: PortalChangeRequestInput["requestType"];
  note: string;
};

export function PortalQuotationDetailClient({ quotationId }: { quotationId: string }) {
  const [quotation, setQuotation] = useState<PortalQuotationDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Negotiation form state
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [changeRequests, setChangeRequests] = useState<Record<string, ChangeRequestDraft>>({});
  const [counterDiscountPct, setCounterDiscountPct] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [generalComment, setGeneralComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Confirm action state
  const [confirmStep, setConfirmStep] = useState<"idle" | "confirming" | "submitting">("idle");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<PortalQuotationDetailDto>(`/api/portal/quotations/${quotationId}`);
      setQuotation(data);
    } catch (err) {
      setLoadError(err instanceof ApiClientError ? err.message : "Failed to load this quotation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  function resetForm() {
    setLineComments({});
    setChangeRequests({});
    setCounterDiscountPct("");
    setRequestedDeliveryDate("");
    setGeneralComment("");
  }

  async function handleSubmitNegotiation() {
    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedComment = generalComment.trim();
    const parsedDiscount = counterDiscountPct.trim() === "" ? undefined : Number(counterDiscountPct);

    if (parsedDiscount !== undefined && (Number.isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100)) {
      setSubmitError("Counter-discount must be a number between 0 and 100.");
      return;
    }

    const lineCommentEntries = Object.entries(lineComments)
      .filter(([, text]) => text.trim().length > 0)
      .map(([lineId, comment]) => ({ lineId, comment: comment.trim() }));

    const changeRequestEntries = Object.entries(changeRequests)
      .filter(([, draft]) => draft.enabled)
      .map(([lineId, draft]) => ({ lineId, requestType: draft.requestType, note: draft.note.trim() }));

    const invalidChangeRequest = changeRequestEntries.find((cr) => cr.note.length === 0);
    if (invalidChangeRequest) {
      setSubmitError("Add a note describing each change request before submitting.");
      return;
    }

    if (
      parsedDiscount === undefined &&
      !requestedDeliveryDate &&
      !trimmedComment &&
      lineCommentEntries.length === 0 &&
      changeRequestEntries.length === 0
    ) {
      setSubmitError("Add a comment, counter-discount, or change request before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await apiRequest<PortalQuotationDetailDto>(
        `/api/portal/quotations/${quotationId}/negotiate`,
        {
          method: "POST",
          body: JSON.stringify({
            counterDiscountPct: parsedDiscount,
            requestedDeliveryDate: requestedDeliveryDate || undefined,
            generalComment: trimmedComment || undefined,
            lineComments: lineCommentEntries.length > 0 ? lineCommentEntries : undefined,
            changeRequests: changeRequestEntries.length > 0 ? changeRequestEntries : undefined,
          }),
        },
      );
      setQuotation(updated);
      resetForm();
      setSubmitSuccess("Your negotiation request was submitted. We'll notify you when sales responds.");
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : "Failed to submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    setConfirmError(null);
    setConfirmSuccess(null);
    setConfirmStep("submitting");
    try {
      const { result, quotation: refreshed } = await apiRequest<{
        result: PortalConfirmResultDto;
        quotation: PortalQuotationDetailDto;
      }>(`/api/portal/quotations/${quotationId}/confirm`, { method: "POST" });
      setQuotation(refreshed);
      setConfirmSuccess(
        result.status === "CONFIRMED"
          ? "Quotation confirmed. Thank you!"
          : "Final terms need one more internal approval before confirming — we'll follow up shortly.",
      );
      setConfirmStep("idle");
    } catch (err) {
      setConfirmError(err instanceof ApiClientError ? err.message : "Failed to confirm this quotation.");
      setConfirmStep("idle");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PortalNav />
        <main className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-24 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading quotation…
        </main>
      </div>
    );
  }

  if (loadError || !quotation) {
    return (
      <div className="min-h-screen bg-background">
        <PortalNav />
        <main className="mx-auto max-w-5xl px-4 py-16">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="text-sm text-destructive">{loadError ?? "This quotation could not be found."}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
              <Link href="/portal">
                <Button variant="secondary" size="sm">
                  Back to My Quotes
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isNegotiable = NEGOTIABLE_STATUSES.has(quotation.status);
  const hasPending = quotation.negotiationStatus === "PENDING";

  return (
    <div className="min-h-screen bg-background">
      <PortalNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/portal"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to My Quotes
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{quotation.code}</h1>
              <Badge variant="outline" className={STATUS_BADGE[quotation.status]}>
                {STATUS_LABEL[quotation.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {quotation.customerName}
              {quotation.validUntil && <> · Valid until {new Date(quotation.validUntil).toLocaleDateString()}</>}
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit price</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotation.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell colSpan={5} className="whitespace-normal p-0">
                      <div className="grid grid-cols-5 gap-2 border-b p-2 last:border-0">
                        <div className="font-medium">
                          {line.productName}
                          <div className="text-xs text-muted-foreground">{line.sku}</div>
                        </div>
                        <div>{line.quantity}</div>
                        <div>${line.unitPrice}</div>
                        <div>{line.discountPct}%</div>
                        <div>${line.lineTotal}</div>
                      </div>

                      <div className="space-y-2 border-b bg-muted/30 p-3 last:border-0">
                        {line.comments.length > 0 && (
                          <ul className="space-y-1">
                            {line.comments.map((c) => (
                              <li key={c.id} className="flex gap-2 text-xs">
                                <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                                <span>
                                  <span className="font-medium">{c.authorLabel}:</span> {c.comment}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {isNegotiable && !hasPending && (
                          <div className="flex flex-col gap-2">
                            <Textarea
                              placeholder="Add a comment about this line…"
                              value={lineComments[line.id] ?? ""}
                              onChange={(e) =>
                                setLineComments((prev) => ({ ...prev, [line.id]: e.target.value }))
                              }
                              className="min-h-8 text-xs"
                            />
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={changeRequests[line.id]?.enabled ?? false}
                                onChange={(e) =>
                                  setChangeRequests((prev) => ({
                                    ...prev,
                                    [line.id]: {
                                      enabled: e.target.checked,
                                      requestType: prev[line.id]?.requestType ?? "QUANTITY_CHANGE",
                                      note: prev[line.id]?.note ?? "",
                                    },
                                  }))
                                }
                              />
                              This is also a change request
                            </label>
                            {changeRequests[line.id]?.enabled && (
                              <div className="flex flex-col gap-1.5 pl-5">
                                <select
                                  className="h-7 w-fit rounded-md border border-input bg-transparent px-2 text-xs"
                                  value={changeRequests[line.id]?.requestType}
                                  onChange={(e) =>
                                    setChangeRequests((prev) => ({
                                      ...prev,
                                      [line.id]: {
                                        ...prev[line.id],
                                        requestType: e.target.value as PortalChangeRequestInput["requestType"],
                                      },
                                    }))
                                  }
                                >
                                  <option value="QUANTITY_CHANGE">Change quantity</option>
                                  <option value="REMOVE_LINE">Remove this line</option>
                                  <option value="OTHER">Other</option>
                                </select>
                                <Input
                                  placeholder="Describe the change you'd like…"
                                  value={changeRequests[line.id]?.note ?? ""}
                                  onChange={(e) =>
                                    setChangeRequests((prev) => ({
                                      ...prev,
                                      [line.id]: { ...prev[line.id], note: e.target.value },
                                    }))
                                  }
                                  className="h-7 text-xs"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex flex-col items-end gap-1 border-t pt-3 text-sm">
              <div className="text-muted-foreground">Order discount: {quotation.orderDiscountPct}%</div>
              <div className="text-base font-semibold">Order total: ${quotation.orderTotal}</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Negotiate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {confirmSuccess && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-600">
                  <CheckCircle2 className="size-4" />
                  {confirmSuccess}
                </p>
              )}
              {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}
              {submitSuccess && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-600">
                  <CheckCircle2 className="size-4" />
                  {submitSuccess}
                </p>
              )}

              {!isNegotiable && !confirmSuccess && (
                <p className="text-sm text-muted-foreground">
                  This quotation is {STATUS_LABEL[quotation.status].toLowerCase()} and is no longer open for
                  negotiation.
                </p>
              )}

              {isNegotiable && hasPending && quotation.pendingNegotiation && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm">
                  <Clock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-700" />
                  <div>
                    <p className="font-medium">Waiting for a response</p>
                    <p className="mt-1 text-muted-foreground">
                      {quotation.pendingNegotiation.counterDiscountPct && (
                        <>Requested {quotation.pendingNegotiation.counterDiscountPct}% discount. </>
                      )}
                      {quotation.pendingNegotiation.requestedDeliveryDate && (
                        <>Delivery by {quotation.pendingNegotiation.requestedDeliveryDate}. </>
                      )}
                      {quotation.pendingNegotiation.generalComment && (
                        <>&ldquo;{quotation.pendingNegotiation.generalComment}&rdquo;</>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted {new Date(quotation.pendingNegotiation.submittedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {isNegotiable && !hasPending && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="counter-discount">Counter-discount (%)</Label>
                    <Input
                      id="counter-discount"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      placeholder="e.g. 10"
                      value={counterDiscountPct}
                      onChange={(e) => setCounterDiscountPct(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="requested-delivery">Requested delivery date</Label>
                    <Input
                      id="requested-delivery"
                      type="date"
                      value={requestedDeliveryDate}
                      onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="general-comment">Comment</Label>
                    <Textarea
                      id="general-comment"
                      placeholder="Anything else you'd like to tell us?"
                      value={generalComment}
                      onChange={(e) => setGeneralComment(e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  {submitError && <p className="text-sm text-destructive">{submitError}</p>}

                  <Button onClick={handleSubmitNegotiation} disabled={submitting} className="w-full">
                    {submitting ? <Loader2 className="animate-spin" /> : <Send />}
                    Submit Negotiation Request
                  </Button>
                </>
              )}

              {isNegotiable && !hasPending && (
                <div className="border-t pt-4">
                  {confirmStep === "idle" && !confirmSuccess && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setConfirmStep("confirming")}
                    >
                      <CheckCircle2 />
                      Accept & Confirm Quotation
                    </Button>
                  )}

                  {confirmStep === "confirming" && (
                    <div className="flex flex-col gap-2 rounded-lg border p-3">
                      <p className="text-sm">Confirm this quotation as-is? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleConfirm}>
                          Yes, Confirm
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmStep("idle")}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {confirmStep === "submitting" && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Confirming…
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Negotiation history</CardTitle>
            </CardHeader>
            <CardContent>
              {quotation.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {[...quotation.history].reverse().map((entry) => (
                    <li key={entry.id} className="flex gap-3 text-sm">
                      <div className="mt-0.5 size-2 shrink-0 rounded-full bg-sky-400" />
                      <div>
                        <p>
                          <span className="font-medium">{entry.actorLabel}</span> — {entry.action}
                        </p>
                        {entry.detail && <p className="text-muted-foreground">{entry.detail}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
