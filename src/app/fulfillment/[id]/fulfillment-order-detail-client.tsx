"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  Receipt,
  Truck,
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
import { getFulfillmentService } from "@/modules/fulfillment/mock/fulfillment-mock-service";
import type {
  BackorderStatus,
  BillingStatus,
  FulfillmentOrderDetailDto,
  FulfillmentStatus,
  OrderStatus,
} from "@/modules/fulfillment/application/types";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT_TO_CUSTOMER: "Sent to customer",
  UNDER_NEGOTIATION: "Under negotiation",
  RE_APPROVAL_REQUIRED: "Re-approval required",
  CONFIRMED: "Confirmed",
  FULFILLMENT: "In fulfillment",
  BILLING: "In billing",
  COMPLETED: "Completed",
};

const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  DRAFT: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-200",
  SUBMITTED: "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-200",
  PENDING_APPROVAL: "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-200",
  APPROVED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
  REJECTED: "border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-200",
  SENT_TO_CUSTOMER: "border-cyan-400/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200",
  UNDER_NEGOTIATION: "border-violet-400/30 bg-violet-400/10 text-violet-700 dark:text-violet-200",
  RE_APPROVAL_REQUIRED: "border-orange-400/30 bg-orange-400/10 text-orange-700 dark:text-orange-200",
  CONFIRMED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
  FULFILLMENT: "border-blue-400/30 bg-blue-400/10 text-blue-700 dark:text-blue-200",
  BILLING: "border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-200",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100",
};

const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  PENDING: "Pending allocation",
  SPLIT_PROPOSED: "Split proposed",
  PARTIALLY_ALLOCATED: "Partially allocated",
  ALLOCATED: "Allocated",
  BACKORDERED: "Backordered",
  SHIPPED: "Shipped",
};

const BACKORDER_STATUS_LABEL: Record<BackorderStatus, string> = {
  OPEN: "Open",
  CONSOLIDATING: "Consolidating",
  RESOLVED: "Resolved",
};

const BACKORDER_STATUS_BADGE: Record<BackorderStatus, string> = {
  OPEN: "border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-200",
  CONSOLIDATING: "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-200",
  RESOLVED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
};

const BILLING_STATUS_BADGE: Record<BillingStatus, string> = {
  DRAFT: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-200",
  ISSUED: "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-200",
  PARTIALLY_PAID: "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-200",
  PAID: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
  VOID: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-200",
  CREDITED: "border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-200",
};

const LINE_STATUS_LABEL: Record<"PENDING" | "ALLOCATED" | "BACKORDERED", string> = {
  PENDING: "Pending",
  ALLOCATED: "Allocated",
  BACKORDERED: "Backordered",
};

export function FulfillmentOrderDetailClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<FulfillmentOrderDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [acceptingSplit, setAcceptingSplit] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideQuantities, setOverrideQuantities] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getFulfillmentService().getOrder(orderId);
      setOrder(data);
      setOverrideQuantities(
        Object.fromEntries(data.suggestedSplit.map((s) => [s.warehouseId, String(s.quantity)])),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load this order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handleAcceptSplit() {
    setActionError(null);
    setActionSuccess(null);
    setAcceptingSplit(true);
    try {
      const updated = await getFulfillmentService().acceptSuggestedSplit(orderId);
      setOrder(updated);
      setActionSuccess("Suggested warehouse split accepted.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to accept the suggested split.");
    } finally {
      setAcceptingSplit(false);
    }
  }

  async function handleOverrideSubmit() {
    setActionError(null);
    setActionSuccess(null);

    const splits = Object.entries(overrideQuantities).map(([warehouseId, qty]) => ({
      warehouseId,
      quantity: Number(qty),
    }));
    if (splits.some((s) => Number.isNaN(s.quantity) || s.quantity < 0)) {
      setActionError("Every warehouse quantity must be a non-negative number.");
      return;
    }

    setOverriding(true);
    try {
      const updated = await getFulfillmentService().overrideSplit(orderId, { splits });
      setOrder(updated);
      setOverrideOpen(false);
      setActionSuccess("Manual override applied.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to apply the manual override.");
    } finally {
      setOverriding(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DealFlowNav />
        <main className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-24 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading order…
        </main>
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="min-h-screen bg-background">
        <DealFlowNav />
        <main className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="text-sm text-destructive">{loadError ?? "This order could not be found."}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
              <Link href="/fulfillment">
                <Button variant="secondary" size="sm">
                  Back to Orders
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const openBackorders = order.backorders.filter((b) => b.status !== "RESOLVED");
  const totalOrdered = order.lines.reduce((sum, l) => sum + l.orderedQty, 0);
  const totalOverride = Object.values(overrideQuantities).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-background">
      <DealFlowNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/fulfillment"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to Orders
        </Link>

        {/* Order Details + Order Status */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{order.orderCode}</h1>
              <Badge variant="outline" className={ORDER_STATUS_BADGE[order.orderStatus]}>
                {ORDER_STATUS_LABEL[order.orderStatus]}
              </Badge>
              {order.fulfillmentStatus && (
                <Badge variant="outline">{FULFILLMENT_STATUS_LABEL[order.fulfillmentStatus]}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {order.customerName} · Order total ${order.orderTotal}
            </p>
          </div>
        </div>

        {actionSuccess && (
          <p className="mb-4 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            {actionSuccess}
          </p>
        )}
        {actionError && <p className="mb-4 text-sm text-destructive">{actionError}</p>}

        {openBackorders.length > 0 && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-300" />
            <div>
              <p className="font-medium">Backorder needs attention</p>
              <p className="text-muted-foreground">
                {openBackorders.length} line{openBackorders.length > 1 ? "s are" : " is"} backordered.
                A consolidation prompt will fire automatically once the short warehouse restocks.
              </p>
            </div>
          </div>
        )}

        {/* Order Lines + Delivery Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Order lines</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Line status</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Est. shipment</TableHead>
                  <TableHead>Shipping cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">
                      {line.productName}
                      <div className="text-xs text-muted-foreground">{line.sku}</div>
                    </TableCell>
                    <TableCell>{line.orderedQty}</TableCell>
                    <TableCell>{line.allocatedQty ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          line.lineStatus === "BACKORDERED"
                            ? BACKORDER_STATUS_BADGE.OPEN
                            : line.lineStatus === "ALLOCATED"
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"
                              : "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-200"
                        }
                      >
                        {LINE_STATUS_LABEL[line.lineStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell>{line.warehouseName ?? "—"}</TableCell>
                    <TableCell>
                      {line.estShipmentDate ? new Date(line.estShipmentDate).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>{line.shippingCost ? `$${line.shippingCost}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Fulfillment / Shipment actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-4" />
                Fulfillment & shipment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!order.fulfillmentStatus && (
                <p className="text-sm text-muted-foreground">
                  This order has been confirmed but fulfillment has not started yet.
                </p>
              )}

              {order.fulfillmentStatus === "SPLIT_PROPOSED" && order.suggestedSplit.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    No single warehouse can cover the full order — here&apos;s a suggested split:
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Est. shipment</TableHead>
                        <TableHead>Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.suggestedSplit.map((s) => (
                        <TableRow key={s.warehouseId}>
                          <TableCell>{s.warehouseName}</TableCell>
                          <TableCell>{s.quantity}</TableCell>
                          <TableCell>
                            {s.estShipmentDate ? new Date(s.estShipmentDate).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>{s.cost ? `$${s.cost}` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={handleAcceptSplit} disabled={acceptingSplit || overriding}>
                      {acceptingSplit ? <Loader2 className="animate-spin" /> : <PackageCheck />}
                      Accept Suggested Split
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOverrideOpen((v) => !v)}
                      disabled={acceptingSplit || overriding}
                    >
                      Manual Override
                    </Button>
                  </div>

                  {overrideOpen && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">
                        Quantities must total {totalOrdered} (currently {totalOverride}).
                      </p>
                      {order.suggestedSplit.map((s) => (
                        <div key={s.warehouseId} className="flex items-center gap-2">
                          <Label htmlFor={`override-${s.warehouseId}`} className="w-32 shrink-0 text-xs">
                            {s.warehouseName}
                          </Label>
                          <Input
                            id={`override-${s.warehouseId}`}
                            type="number"
                            min={0}
                            value={overrideQuantities[s.warehouseId] ?? ""}
                            onChange={(e) =>
                              setOverrideQuantities((prev) => ({
                                ...prev,
                                [s.warehouseId]: e.target.value,
                              }))
                            }
                            className="h-8 w-28"
                          />
                        </div>
                      ))}
                      <Button
                        size="sm"
                        onClick={handleOverrideSubmit}
                        disabled={overriding || totalOverride !== totalOrdered}
                      >
                        {overriding ? <Loader2 className="animate-spin" /> : null}
                        Apply Override
                      </Button>
                    </div>
                  )}
                </>
              )}

              {order.fulfillmentStatus &&
                order.fulfillmentStatus !== "SPLIT_PROPOSED" && (
                  <p className="text-sm text-muted-foreground">
                    {order.fulfillmentStatus === "SHIPPED"
                      ? "All lines have shipped."
                      : `Current status: ${FULFILLMENT_STATUS_LABEL[order.fulfillmentStatus]}.`}
                  </p>
                )}

              {/* Backorder Status */}
              {order.backorders.length > 0 && (
                <div className="border-t pt-3">
                  <p className="mb-2 text-sm font-medium">Backorders</p>
                  <ul className="space-y-2">
                    {order.backorders.map((b) => (
                      <li key={b.id} className="flex items-start justify-between gap-2 text-sm">
                        <div>
                          <p>{b.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.remainingQty} units short at {b.warehouseName}
                            {b.restockEta && <> · Restock ETA {new Date(b.restockEta).toLocaleDateString()}</>}
                          </p>
                        </div>
                        <Badge variant="outline" className={BACKORDER_STATUS_BADGE[b.status]}>
                          {BACKORDER_STATUS_LABEL[b.status]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Billing Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="size-4" />
                Billing
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!order.billing ? (
                <p className="text-sm text-muted-foreground">No invoice has been generated yet.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{order.billing.invoiceCode}</span>
                    <Badge variant="outline" className={BILLING_STATUS_BADGE[order.billing.status]}>
                      {order.billing.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">
                    ${order.billing.paidAmount} paid of ${order.billing.totalAmount}
                  </p>
                  {order.billing.dueDate && (
                    <p className="text-xs text-muted-foreground">
                      Due {new Date(order.billing.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Timeline */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4" />
              Order timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {[...order.timeline].reverse().map((entry) => (
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
      </main>
    </div>
  );
}
