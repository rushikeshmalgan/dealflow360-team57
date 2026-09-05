"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";

import { PortalNav } from "@/components/portal/portal-nav";
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
  PortalNegotiationStatus,
  PortalQuotationListItemDto,
  PortalQuotationStatus,
} from "@/modules/portal/application/types";

const STATUS_BADGE: Record<PortalQuotationStatus, string> = {
  SENT_TO_CUSTOMER: "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-200",
  UNDER_NEGOTIATION: "border-violet-400/30 bg-violet-400/10 text-violet-700 dark:text-violet-200",
  RE_APPROVAL_REQUIRED: "border-orange-400/30 bg-orange-400/10 text-orange-700 dark:text-orange-200",
  CONFIRMED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100",
};

const STATUS_LABEL: Record<PortalQuotationStatus, string> = {
  SENT_TO_CUSTOMER: "Awaiting your review",
  UNDER_NEGOTIATION: "In negotiation",
  RE_APPROVAL_REQUIRED: "Awaiting internal approval",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
};

const NEGOTIATION_LABEL: Record<PortalNegotiationStatus, string> = {
  NONE: "No requests yet",
  PENDING: "Response pending",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

export default function PortalQuotationsListPage() {
  const [quotations, setQuotations] = useState<PortalQuotationListItemDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<PortalQuotationListItemDto[]>("/api/portal/quotations");
      setQuotations(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load your quotations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PortalNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Quotes</h1>
            <p className="text-sm text-muted-foreground">
              Review quotations, request changes, and confirm orders.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quotations</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading your quotations…
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              </div>
            )}

            {!loading && !error && quotations && quotations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <FileText className="size-8" />
                <p className="text-sm">You don&apos;t have any quotations yet.</p>
              </div>
            )}

            {!loading && !error && quotations && quotations.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Negotiation</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotations.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">{q.code}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE[q.status]}>
                          {STATUS_LABEL[q.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {NEGOTIATION_LABEL[q.negotiationStatus]}
                      </TableCell>
                      <TableCell>${q.total}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(q.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Link href={`/portal/quotations/${q.id}`}>
                          <Button size="sm" variant="secondary">
                            View & Negotiate
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
