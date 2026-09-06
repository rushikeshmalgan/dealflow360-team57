"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, PackageSearch, RefreshCw, Warehouse } from "lucide-react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type {
  FulfillmentOrderListItemDto,
  FulfillmentStatus,
  OrderStatus,
} from "@/modules/fulfillment/application/types";

const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  DRAFT: "border-slate-300 bg-slate-100 text-slate-800",
  SUBMITTED: "border-sky-400/30 bg-sky-400/10 text-sky-700",
  PENDING_APPROVAL: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  APPROVED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700",
  REJECTED: "border-rose-400/30 bg-rose-400/10 text-rose-700",
  SENT_TO_CUSTOMER: "border-cyan-400/30 bg-cyan-400/10 text-cyan-700",
  UNDER_NEGOTIATION: "border-violet-400/30 bg-violet-400/10 text-violet-700",
  RE_APPROVAL_REQUIRED: "border-orange-400/30 bg-orange-400/10 text-orange-700",
  CONFIRMED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700",
  FULFILLMENT: "border-blue-400/30 bg-blue-400/10 text-blue-200",
  BILLING: "border-indigo-400/30 bg-indigo-400/10 text-indigo-700",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
};

const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  PENDING: "Pending allocation",
  SPLIT_PROPOSED: "Split proposed",
  PARTIALLY_ALLOCATED: "Partially allocated",
  ALLOCATED: "Allocated",
  BACKORDERED: "Backordered",
  SHIPPED: "Shipped",
};

const FULFILLMENT_STATUS_BADGE: Record<FulfillmentStatus, string> = {
  PENDING: "border-slate-300 bg-slate-100 text-slate-800",
  SPLIT_PROPOSED: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  PARTIALLY_ALLOCATED: "border-orange-400/30 bg-orange-400/10 text-orange-700",
  ALLOCATED: "border-sky-400/30 bg-sky-400/10 text-sky-700",
  BACKORDERED: "border-rose-400/30 bg-rose-400/10 text-rose-700",
  SHIPPED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700",
};

export default function FulfillmentPage() {
  const [orders, setOrders] = useState<FulfillmentOrderListItemDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<FulfillmentOrderListItemDto[]>("/api/fulfillment/orders");
      setOrders(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const readyCount = orders?.filter((o) => o.fulfillmentStatus === null || o.fulfillmentStatus === "PENDING").length ?? 0;
  const backorderCount = orders?.filter((o) => o.hasOpenBackorder).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <DealFlowNav />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Orders Awaiting Fulfillment</h1>
            <p className="text-sm text-muted-foreground">
              Track confirmed orders from allocation through shipment and billing.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/warehouses">
              <Button variant="outline" size="sm">
                <Warehouse />
                View Warehouse Stock
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </div>

        {!loading && !error && orders && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Total orders</p>
                <p className="mt-2 text-3xl font-semibold">{orders.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Awaiting allocation</p>
                <p className="mt-2 text-3xl font-semibold">{readyCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Open backorders</p>
                <p className="mt-2 text-3xl font-semibold">{backorderCount}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading orders…
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <AlertTriangle className="size-8 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              </div>
            )}

            {!loading && !error && orders && orders.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <PackageSearch className="size-8" />
                <p className="text-sm">No orders are awaiting fulfillment right now.</p>
              </div>
            )}

            {!loading && !error && orders && orders.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Order status</TableHead>
                    <TableHead>Fulfillment status</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderCode}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ORDER_STATUS_BADGE[order.orderStatus]}>
                          {order.orderStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.fulfillmentStatus ? (
                          <Badge
                            variant="outline"
                            className={FULFILLMENT_STATUS_BADGE[order.fulfillmentStatus]}
                          >
                            {FULFILLMENT_STATUS_LABEL[order.fulfillmentStatus]}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not started</span>
                        )}
                        {order.hasOpenBackorder && (
                          <Badge variant="outline" className="ml-1.5 border-rose-400/30 bg-rose-400/10 text-rose-700">
                            Backorder
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{order.lineCount}</TableCell>
                      <TableCell>${order.amount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(order.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Link href={`/fulfillment/${order.id}`}>
                          <Button size="sm" variant="secondary">
                            View Order
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
