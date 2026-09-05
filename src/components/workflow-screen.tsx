"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Download, Plus, Search, ShieldAlert } from "lucide-react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type WorkflowRow = {
  id: string;
  name: string;
  detail: string;
  value: string;
  status: string;
  tone: "blue" | "green" | "amber" | "red";
};

const SCREEN_DATA: Record<string, {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  metrics: [string, string, string][];
  rows: WorkflowRow[];
}> = {
  quotations: {
    eyebrow: "Sales workspace",
    title: "Quotation pipeline",
    description: "Build, review and move customer quotes through the approval chain.",
    action: "New quotation",
    metrics: [["Open quotes", "18", "+12% this week"], ["Pipeline value", "$482.5k", "Across active deals"], ["Win rate", "64%", "Last 30 days"]],
    rows: [
      { id: "Q-1049", name: "Acme Industrial Corp", detail: "Enterprise hardware bundle", value: "$124,000", status: "Pending approval", tone: "amber" },
      { id: "Q-1048", name: "Apex Telecom", detail: "Network expansion", value: "$96,400", status: "Approved", tone: "green" },
      { id: "Q-1047", name: "Cyberdyne Systems", detail: "Fulfillment renewal", value: "$88,500", status: "Negotiation", tone: "blue" },
      { id: "Q-1044", name: "Wayne Enterprises", detail: "Warehouse automation", value: "$215,000", status: "At risk", tone: "red" },
    ],
  },
  approvals: {
    eyebrow: "Governance center",
    title: "Approval queue",
    description: "Resolve discount, credit and delivery exceptions before a quote is released.",
    action: "Configure rules",
    metrics: [["Waiting for review", "4", "2 high priority"], ["Average response", "3.2h", "Down 18%"], ["Approved today", "12", "92% within SLA"]],
    rows: [
      { id: "APR-208", name: "Acme Industrial Corp", detail: "28.5% discount exceeds tier ceiling", value: "$124,000", status: "Finance review", tone: "red" },
      { id: "APR-207", name: "Stark Global Logistics", detail: "Credit limit review required", value: "$64,200", status: "Manager review", tone: "amber" },
      { id: "APR-205", name: "Apex Telecom", detail: "15% strategic account discount", value: "$96,400", status: "Approved", tone: "green" },
    ],
  },
  fulfillment: {
    eyebrow: "Order operations",
    title: "Fulfillment control",
    description: "Track confirmed orders from allocation through dispatch and delivery.",
    action: "Create shipment",
    metrics: [["Ready to ship", "23", "7 due today"], ["In transit", "41", "96% on time"], ["Exceptions", "3", "Needs attention"]],
    rows: [
      { id: "ORD-7821", name: "Apex Telecom", detail: "Chicago DC · 12 line items", value: "$96,400", status: "Ready to ship", tone: "blue" },
      { id: "ORD-7818", name: "Cyberdyne Systems", detail: "Austin DC · 8 line items", value: "$88,500", status: "In transit", tone: "green" },
      { id: "ORD-7804", name: "Wayne Enterprises", detail: "Newark DC · Delivery slippage", value: "$215,000", status: "Exception", tone: "red" },
    ],
  },
  subscriptions: {
    eyebrow: "Recurring revenue",
    title: "Subscription portfolio",
    description: "Monitor active recurring contracts, renewals and customer expansion.",
    action: "New subscription",
    metrics: [["Active subscriptions", "126", "+8 this month"], ["Monthly recurring", "$184.2k", "Across 42 accounts"], ["Renewals due", "9", "Next 30 days"]],
    rows: [
      { id: "SUB-441", name: "Apex Telecom", detail: "Managed network · Annual", value: "$18,400/mo", status: "Active", tone: "green" },
      { id: "SUB-438", name: "Stark Global Logistics", detail: "Inventory intelligence · Annual", value: "$12,800/mo", status: "Renewal soon", tone: "amber" },
      { id: "SUB-429", name: "Umbrella Health", detail: "Analytics workspace · Monthly", value: "$4,200/mo", status: "Active", tone: "blue" },
    ],
  },
  invoices: {
    eyebrow: "Finance operations",
    title: "Invoice center",
    description: "Keep billing, collection status and revenue recognition in one view.",
    action: "Create invoice",
    metrics: [["Outstanding", "$218.4k", "14 invoices"], ["Collected this month", "$742.8k", "96% of target"], ["Past due", "$32.1k", "Needs follow-up"]],
    rows: [
      { id: "INV-2208", name: "Acme Industrial Corp", detail: "Net 30 · Due Sep 22, 2026", value: "$124,000", status: "Awaiting payment", tone: "amber" },
      { id: "INV-2204", name: "Apex Telecom", detail: "Net 30 · Paid Sep 03, 2026", value: "$96,400", status: "Paid", tone: "green" },
      { id: "INV-2198", name: "Wayne Enterprises", detail: "Net 45 · Due Aug 14, 2026", value: "$64,200", status: "Past due", tone: "red" },
    ],
  },
  "deal-health": {
    eyebrow: "Risk intelligence",
    title: "Deal health monitor",
    description: "Surface discount, delivery and engagement signals before deals stall.",
    action: "Review signals",
    metrics: [["Healthy deals", "27", "72% of active pipeline"], ["At-risk deals", "3", "2 high priority"], ["Signals resolved", "18", "This week"]],
    rows: [
      { id: "Q-1049", name: "Acme Industrial Corp", detail: "Discount exceeds tier ceiling", value: "$124,000", status: "High risk", tone: "red" },
      { id: "Q-1047", name: "Cyberdyne Systems", detail: "Shipment delivery slippage > 14 days", value: "$88,500", status: "Medium risk", tone: "amber" },
      { id: "Q-1044", name: "Wayne Enterprises", detail: "No response for 19 days", value: "$215,000", status: "Medium risk", tone: "amber" },
    ],
  },
  reports: {
    eyebrow: "Business intelligence",
    title: "Reports & insights",
    description: "A decision-ready view of pipeline, conversion, inventory and revenue.",
    action: "Export report",
    metrics: [["Pipeline coverage", "3.8x", "Above 3x target"], ["Quote conversion", "64%", "+6.4% quarter over quarter"], ["Revenue forecast", "$1.24m", "87% confidence"]],
    rows: [
      { id: "RPT-01", name: "Pipeline performance", detail: "Weekly sales operations summary", value: "$482,500", status: "Ready", tone: "green" },
      { id: "RPT-02", name: "Inventory exposure", detail: "Stock, reservation and reorder analysis", value: "8 warehouses", status: "Ready", tone: "blue" },
      { id: "RPT-03", name: "Approval efficiency", detail: "SLA and exception trends", value: "3.2h avg", status: "Processing", tone: "amber" },
    ],
  },
};

const toneClasses = {
  blue: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  red: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

export function WorkflowScreen({ screen }: { screen: keyof typeof SCREEN_DATA }) {
  const data = SCREEN_DATA[screen];
  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <DealFlowNav />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        <section className="rounded-2xl border border-sky-400/20 bg-[#0d1d31] p-6 shadow-2xl shadow-sky-950/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">{data.eyebrow}</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{data.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{data.description}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800"><Download className="mr-2 h-4 w-4" />Export</Button>
              <Button className="bg-sky-500 text-slate-950 hover:bg-sky-400"><Plus className="mr-2 h-4 w-4" />{data.action}</Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          {data.metrics.map(([label, value, note]) => (
            <Card key={label} className="border-slate-800 bg-[#0d1d31]">
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-50">{value}</p>
                <p className="mt-1 text-xs text-sky-300">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-slate-800 bg-[#0d1d31]">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-800">
            <CardTitle className="text-base">Live work queue</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input placeholder="Search records" className="border-slate-700 bg-[#07111f] pl-9 text-slate-100 placeholder:text-slate-500" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-800">
              {data.rows.map((row) => (
                <div key={row.id} className="grid gap-3 px-5 py-4 transition-colors hover:bg-slate-800/40 md:grid-cols-[1fr_1.4fr_auto_auto_auto] md:items-center">
                  <div><p className="font-semibold text-slate-100">{row.id}</p><p className="text-xs text-slate-500">{row.name}</p></div>
                  <p className="text-sm text-slate-400">{row.detail}</p>
                  <p className="font-semibold text-slate-100">{row.value}</p>
                  <Badge className={cn("w-fit border", toneClasses[row.tone])}>{row.status}</Badge>
                  <Link href={`/${screen}`} className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowRight className="h-4 w-4" /></Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-[#0b182a] px-4 py-3 text-xs text-slate-400">
          {data.title === "Approval queue" ? <ShieldAlert className="h-4 w-4 text-amber-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
          <span>Workspace data is synced with the quote-to-cash workflow.</span>
          <span className="ml-auto flex items-center gap-1 text-slate-500"><Clock3 className="h-3.5 w-3.5" />Updated moments ago</span>
        </div>
      </main>
    </div>
  );
}
