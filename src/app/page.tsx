"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Command,
  FileText,
  Layers,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SignedIn, SignedOut, useAuth } from "@clerk/nextjs";

import { DealFlowNav } from "@/components/dealflow-nav";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiRequest } from "@/lib/api-client";

interface PipelineMetric {
  title: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: string;
  href: string;
  isLive: boolean;
}

/**
 * Only the fields this dashboard reads off GET /api/quotations — see
 * src/modules/quotation/application/types.ts QuotationDto for the full shape the API returns.
 */
type QuotationSummaryRow = {
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "SENT_TO_CUSTOMER"
    | "UNDER_NEGOTIATION"
    | "RE_APPROVAL_REQUIRED"
    | "CONFIRMED"
    | "FULFILLMENT"
    | "BILLING"
    | "COMPLETED";
  summary: { netBeforeTax: string };
};

// Terminal states no longer count as "open pipeline" (TAD SS9 state machine).
const CLOSED_STATUSES = new Set(["REJECTED", "COMPLETED"]);

export default function HomePage() {
  const { isSignedIn } = useAuth();
  const [productCount, setProductCount] = useState<number | null>(null);
  const [quotations, setQuotations] = useState<QuotationSummaryRow[] | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setProductCount(null);
      setQuotations(null);
      return;
    }

    let cancelled = false;
    apiRequest<{ id: string }[]>("/api/products")
      .then((data) => {
        if (!cancelled) setProductCount(data.length);
      })
      .catch(() => {
        // Catalog tile falls back to its placeholder below if this 404s/500s.
      });

    apiRequest<QuotationSummaryRow[]>("/api/quotations")
      .then((data) => {
        if (!cancelled) setQuotations(data);
      })
      .catch((err) => {
        if (cancelled) return;
        // A Sales Rep's list is scoped to their own quotations server-side (quotation-service.ts);
        // an empty/denied result here is expected for non-Rep roles, not a bug.
        setPipelineError(err instanceof ApiClientError ? err.message : "Failed to load quotations.");
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const openQuotations = quotations?.filter((q) => !CLOSED_STATUSES.has(q.status)) ?? null;
  const pendingApprovals = quotations?.filter((q) => q.status === "PENDING_APPROVAL") ?? null;
  const pipelineTotal =
    openQuotations?.reduce((sum, q) => sum + Number(q.summary.netBeforeTax), 0) ?? null;

  const metrics: PipelineMetric[] = [
    {
      title: "Open Quotations",
      value: openQuotations !== null ? String(openQuotations.length) : "—",
      sub:
        pipelineTotal !== null
          ? `$${pipelineTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} total pipeline`
          : pipelineError ?? "Loading…",
      icon: FileText,
      trend: "Live from /api/quotations",
      href: "/quotations",
      isLive: true,
    },
    {
      title: "Pending Approvals",
      value: pendingApprovals !== null ? String(pendingApprovals.length) : "—",
      sub: "Quotations awaiting Manager / Finance review",
      icon: Clock,
      trend: "Live from /api/quotations",
      href: "/approvals",
      isLive: true,
    },
    {
      title: "At-Risk Deals",
      value: "3",
      sub: "Flagged by Deal Health Engine",
      icon: AlertTriangle,
      trend: "Sample data — Deal Health module not built yet",
      href: "/deal-health",
      isLive: false,
    },
    {
      title: "Active Catalog",
      value: productCount !== null ? String(productCount) : "—",
      sub: "Products & tiered price lists",
      icon: Package,
      trend: "Live from /api/products",
      href: "/products",
      isLive: true,
    },
  ];

  const atRiskDeals = [
    {
      id: "Q-1049",
      customer: "Acme Industrial Corp",
      amount: "$124,000",
      discount: "28.5%",
      riskReason: "Discount exceeds tier ceiling (20% max)",
      severity: "high",
      status: "PENDING_APPROVAL",
    },
    {
      id: "Q-1047",
      customer: "Cyberdyne Systems",
      amount: "$88,500",
      discount: "18.0%",
      riskReason: "Shipment delivery slippage > 14 days",
      severity: "medium",
      status: "APPROVED",
    },
    {
      id: "Q-1044",
      customer: "Wayne Enterprises",
      amount: "$215,000",
      discount: "14.2%",
      riskReason: "Quotation idle for 19 days without response",
      severity: "medium",
      status: "NEGOTIATION",
    },
    {
      id: "Q-1041",
      customer: "Stark Global Logistics",
      amount: "$64,200",
      discount: "9.0%",
      riskReason: "Credit limit review required by Finance",
      severity: "low",
      status: "PENDING_APPROVAL",
    },
  ];

  const recentActivity = [
    {
      id: "ACT-01",
      time: "10 mins ago",
      actor: "Sarah Jenkins (Sales Manager)",
      action: "Approved 15% discount for Quotation Q-1048 (Apex Telecom)",
      type: "approval",
    },
    {
      id: "ACT-02",
      time: "42 mins ago",
      actor: "Marcus Vance (Sales Rep)",
      action: "Submitted Quotation Q-1049 ($124k) for Finance escalation",
      type: "quote",
    },
    {
      id: "ACT-03",
      time: "2 hours ago",
      actor: "System (Risk Engine)",
      action: "Flagged Q-1047 for warehouse lead-time anomaly",
      type: "risk",
    },
    {
      id: "ACT-04",
      time: "4 hours ago",
      actor: "Elena Rostova (Finance Ops)",
      action: "Configured Enterprise Tier discount ceilings in Screen 18",
      type: "config",
    },
  ];

  const workflowStages = [
    { num: "01", name: "Catalog & Pricing", desc: "Master products, price lists & customer tiers" },
    { num: "02", name: "Quotation Builder", desc: "Line discounts with live ceiling enforcement" },
    { num: "03", name: "Approval Chain", desc: "Risk-based routing to Manager & Finance" },
    { num: "04", name: "Customer Portal", desc: "Counter-proposals, chat & digital signature" },
    { num: "05", name: "Billing & Order", desc: "One-time dispatch, subscriptions & invoices" },
  ];

  return (
    <div className="min-h-screen bg-[#171b22] pb-16">
      <DealFlowNav />

      <SignedOut>
        <main className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
          <Card className="border-border bg-card p-8 text-center shadow-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-5">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              DealFlow360 Commercial Operations
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Authentication required. Sign in to access your sales operations dashboard, active pipeline metrics, quotation approvals, and deal health telemetry.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link
                href="/sign-in"
                className={buttonVariants({ size: "lg", className: "px-6 font-semibold shadow-sm" })}
              >
                Sign In to DealFlow360
              </Link>
            </div>
          </Card>
        </main>
      </SignedOut>

      <SignedIn>
        <main className="mx-auto max-w-7xl space-y-8 px-4 pt-8 sm:px-6">
          {/* Welcome & Command Bar */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Sales Operations Hub
                </span>
                <span className="text-xs text-muted-foreground">Screen 2 • DealFlow360</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Commercial Operations Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Real-time quote-to-cash pipeline, automated approval governance, and deal health telemetry.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/products"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Package className="mr-1.5 h-4 w-4" />
                Product Catalog
              </Link>
              <Link
                href="/approvals"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Approval Queue
              </Link>
              <Link
                href="/products/new"
                className={buttonVariants({ size: "sm" })}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Product
              </Link>
            </div>
          </div>

          {/* Top KPI Metrics Tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => {
              const Icon = m.icon;
              return (
                <Card key={m.title} className="transition-all hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {m.title}
                    </CardTitle>
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{m.value}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{m.sub}</p>
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {m.trend}
                      </span>
                      <Link
                        href={m.href}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        View
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* End-to-End Lifecycle Stages */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Quote-to-Cash End-to-End Lifecycle
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Unified governance flow connecting pricing, discount risk scoring, approvals, and fulfillment.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  P0 Architecture
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {workflowStages.map((stage) => (
                  <div
                    key={stage.num}
                    className="relative rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
                        {stage.num}
                      </span>
                      <span className="text-xs font-semibold text-foreground truncate">
                        {stage.name}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {stage.desc}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Main 2-Column Split: At-Risk Deals & Recent Activity */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left 2 Cols: At-Risk Deals & Priority Approvals */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base font-semibold">
                    At-Risk Deals & Escalation Queue
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Deals requiring action due to discount boundary violations or delivery slippage.
                  </CardDescription>
                </div>
                <Link href="/deal-health" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  View All Flags
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Quote</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Risk Signal</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atRiskDeals.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell className="font-mono text-xs font-bold text-primary">
                          {deal.id}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {deal.customer}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">{deal.amount}</TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant={deal.severity === "high" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {deal.discount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {deal.riskReason}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href="/quotations"
                            className={buttonVariants({ variant: "outline", size: "xs" })}
                          >
                            Review
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Right Col: Live Activity Stream */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Audit & Activity Log</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    Live Feed
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Immutable event stream for compliance (Screen 18).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((act) => (
                    <div key={act.id} className="flex gap-3 text-xs">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {act.type === "approval" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : act.type === "risk" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                          <Layers className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground leading-snug">{act.action}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{act.actor}</span>
                          <span>•</span>
                          <span>{act.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                  <Link
                    href="/products"
                    className={buttonVariants({ variant: "outline", size: "sm", className: "w-full text-xs justify-center" })}
                  >
                    Browse Product Catalog
                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SignedIn>
    </div>
  );
}
