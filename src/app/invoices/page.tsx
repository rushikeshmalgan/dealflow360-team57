"use client";

import { useEffect, useState } from "react";

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
import { DealFlowNav } from "@/components/dealflow-nav";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { CustomerDto } from "@/modules/customers/application/types";
import type { InvoiceDto } from "@/modules/invoice";

type DraftLine = { description: string; quantity: string; unitPrice: string };

const STATUS_TONE: Record<InvoiceDto["status"], "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  ISSUED: "secondary",
  PARTIALLY_PAID: "secondary",
  PAID: "default",
  VOID: "outline",
  CREDITED: "outline",
};

/**
 * Epic 11 (Payment & Invoice Status). Real GET/POST /api/invoices and POST
 * /api/invoices/:id/payments — replaces the WorkflowScreen mock this route used to render.
 */
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceDto[] | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [lines, setLines] = useState<DraftLine[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});
  const [payingId, setPayingId] = useState<string | null>(null);

  async function loadInvoices() {
    try {
      setInvoices(await apiRequest<InvoiceDto[]>("/api/invoices"));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load invoices.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      await loadInvoices();
      if (cancelled) return;
      try {
        const c = await apiRequest<CustomerDto[]>("/api/customers");
        if (!cancelled) {
          setCustomers(c);
          setCustomerId((current) => current || c[0]?.id || "");
        }
      } catch {
        // Create-invoice form just shows "No customers yet" below.
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  const draftTotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const cleanLines = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
      }));
    if (!customerId || cleanLines.length === 0) {
      setCreateError("Pick a customer and add at least one line item.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/invoices", {
        method: "POST",
        body: JSON.stringify({ customerId, currency, lines: cleanLines }),
      });
      setLines([{ description: "", quantity: "1", unitPrice: "0" }]);
      setIsCreating(false);
      await loadInvoices();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordPayment(invoiceId: string) {
    const amount = Number(paymentDrafts[invoiceId]);
    if (!amount || amount <= 0) return;
    setPayingId(invoiceId);
    setError(null);
    try {
      await apiRequest(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          idempotencyKey: `${invoiceId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      setPaymentDrafts((prev) => ({ ...prev, [invoiceId]: "" }));
      await loadInvoices();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to record payment.");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-secondary">
      <DealFlowNav />
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Invoice center</h1>
            <p className="text-sm text-muted-foreground">
              Create invoices and record payments — status derives from what&apos;s actually been paid.
            </p>
          </div>
          <Button onClick={() => setIsCreating((v) => !v)}>
            {isCreating ? "Cancel" : "+ Create Invoice"}
          </Button>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {isCreating && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New invoice</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-customer">Customer</Label>
                    <select
                      id="inv-customer"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                    >
                      {!customers || customers.length === 0 ? (
                        <option value="">No customers yet</option>
                      ) : (
                        customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.tier.name})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-currency">Currency</Label>
                    <Input
                      id="inv-currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      maxLength={3}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Line items</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLines((prev) => [...prev, { description: "", quantity: "1", unitPrice: "0" }])}
                    >
                      + Add line
                    </Button>
                  </div>
                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-[1fr_100px_140px_auto] gap-2">
                      <Input
                        placeholder="Description"
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Unit price"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={lines.length === 1}
                        onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>

                <p className="text-sm font-medium">
                  Total: {currency} {draftTotal.toFixed(2)}
                </p>

                {createError && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {createError}
                  </p>
                )}

                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Invoice"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Invoices</h2>
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading invoices…</p>
            ) : !invoices || invoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No invoices yet. Click &ldquo;+ Create Invoice&rdquo; to add one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Record payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const settled = inv.status === "PAID" || inv.status === "VOID" || inv.status === "CREDITED";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs font-semibold">{inv.invoiceCode}</TableCell>
                        <TableCell>{inv.customer.name}</TableCell>
                        <TableCell className="text-right">
                          {inv.currency} {Number(inv.totalAmount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {inv.currency} {Number(inv.paidAmount).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {settled ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="h-8 w-28"
                                placeholder="Amount"
                                value={paymentDrafts[inv.id] ?? ""}
                                onChange={(e) =>
                                  setPaymentDrafts((prev) => ({ ...prev, [inv.id]: e.target.value }))
                                }
                              />
                              <Button
                                type="button"
                                size="sm"
                                disabled={payingId === inv.id}
                                onClick={() => handleRecordPayment(inv.id)}
                              >
                                {payingId === inv.id ? "Recording…" : "Record"}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
