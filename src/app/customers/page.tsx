"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Crown,
  Mail,
  Plus,
  RefreshCw,
  Users,
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
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { CustomerDto, TierDto } from "@/modules/customers/application/types";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerDto[] | null>(null);
  const [tiers, setTiers] = useState<TierDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create customer state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTierId, setNewTierId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Create tier state
  const [isCreatingTier, setIsCreatingTier] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [tierCreateSubmitting, setTierCreateSubmitting] = useState(false);
  const [tierCreateError, setTierCreateError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [custRes, tierRes] = await Promise.all([
        apiRequest<CustomerDto[]>("/api/customers"),
        apiRequest<TierDto[]>("/api/customer-tiers"),
      ]);
      setCustomers(custRes);
      setTiers(tierRes);
      if (tierRes.length > 0 && !newTierId) {
        setNewTierId(tierRes[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await apiRequest("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          tierId: newTierId,
          primaryContactEmail: newEmail.trim() || null,
        }),
      });
      setIsCreating(false);
      setNewName("");
      setNewEmail("");
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create customer.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleCreateTier(e: React.FormEvent) {
    e.preventDefault();
    setTierCreateSubmitting(true);
    setTierCreateError(null);
    try {
      await apiRequest("/api/customer-tiers", {
        method: "POST",
        body: JSON.stringify({ name: newTierName.trim() }),
      });
      setIsCreatingTier(false);
      setNewTierName("");
      await loadData();
    } catch (err) {
      setTierCreateError(err instanceof ApiClientError ? err.message : "Failed to create tier.");
    } finally {
      setTierCreateSubmitting(false);
    }
  }

  const filteredCustomers = (customers ?? []).filter((c) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      c.tier.name.toLowerCase().includes(term) ||
      (c.primaryContactEmail ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-[#171b22] text-slate-100">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Header */}
        <section className="rounded-xl border border-slate-600/60 bg-[#232a34] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-400 uppercase">
                CRM Module
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Customers &amp; Tiers
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Manage your customer accounts and tier-based pricing classifications.
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
                onClick={() => setIsCreatingTier(true)}
                className="bg-purple-600 font-medium text-white hover:bg-purple-500"
              >
                <Crown className="mr-1.5 h-4 w-4" />
                New Tier
              </Button>
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="bg-sky-500 font-medium text-white hover:bg-sky-400"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Customer
              </Button>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Total Customers</span>
                <Users className="h-4 w-4 text-sky-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                {customers?.length ?? "—"}
              </div>
              <div className="mt-1 text-xs text-slate-400">Active accounts</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Customer Tiers</span>
                <Crown className="h-4 w-4 text-purple-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                {tiers?.length ?? "—"}
              </div>
              <div className="mt-1 text-xs text-slate-400">Pricing classifications</div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>With Email</span>
                <Mail className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                {customers?.filter((c) => c.primaryContactEmail).length ?? "—"}
              </div>
              <div className="mt-1 text-xs text-slate-400">Contactable accounts</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Tiers Card */}
        <section className="rounded-xl border border-slate-700/60 bg-[#232a34] p-6 shadow-xl">
          <h2 className="mb-4 text-sm font-bold tracking-wider text-slate-300 uppercase">
            Customer Tiers
          </h2>
          <div className="flex flex-wrap gap-2">
            {tiers === null ? (
              <span className="text-sm text-slate-400">Loading tiers…</span>
            ) : tiers.length === 0 ? (
              <span className="text-sm text-slate-400">No tiers yet — create one above.</span>
            ) : (
              tiers.map((t) => (
                <Badge
                  key={t.id}
                  className="border border-purple-400/30 bg-purple-400/10 px-3 py-1 text-xs font-semibold text-purple-200"
                >
                  <Crown className="mr-1.5 h-3 w-3" />
                  {t.name}
                </Badge>
              ))
            )}
          </div>
        </section>

        {/* Customers Table */}
        <section className="rounded-xl border border-slate-700/60 bg-[#232a34] p-6 shadow-xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
            <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
              All Customers
            </h2>
            <div className="relative w-full max-w-xs">
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-slate-700 bg-[#1c222b] text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading customers...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No customers found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Name</TableHead>
                    <TableHead className="text-slate-300">Tier</TableHead>
                    <TableHead className="text-slate-300">Contact Email</TableHead>
                    <TableHead className="text-slate-300">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((cust) => (
                    <TableRow
                      key={cust.id}
                      className="border-slate-800 transition-colors hover:bg-slate-800/50"
                    >
                      <TableCell className="font-medium text-white">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-sky-400" />
                          {cust.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="border border-purple-400/30 bg-purple-400/10 text-xs text-purple-200">
                          {cust.tier.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {cust.primaryContactEmail ?? (
                          <span className="text-slate-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
                        {new Date(cust.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </main>

      {/* Create Customer Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-lg border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white">
                Create New Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                    {createError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Customer Name</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Acme Industrial Corp"
                    className="border-slate-700 bg-[#232a34] text-slate-100"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Customer Tier</Label>
                  <select
                    value={newTierId}
                    onChange={(e) => setNewTierId(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100"
                    required
                  >
                    {(tiers ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Primary Contact Email (optional)</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="contact@example.com"
                    className="border-slate-700 bg-[#232a34] text-slate-100"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreating(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createSubmitting}
                    className="bg-sky-500 font-semibold text-white hover:bg-sky-400"
                  >
                    {createSubmitting ? "Creating..." : "Create Customer"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Tier Modal */}
      {isCreatingTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white">
                Create New Tier
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreateTier} className="space-y-4">
                {tierCreateError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                    {tierCreateError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Tier Name</Label>
                  <Input
                    value={newTierName}
                    onChange={(e) => setNewTierName(e.target.value)}
                    placeholder="e.g. Enterprise, SMB, Startup"
                    className="border-slate-700 bg-[#232a34] text-slate-100"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreatingTier(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={tierCreateSubmitting}
                    className="bg-purple-600 font-semibold text-white hover:bg-purple-500"
                  >
                    {tierCreateSubmitting ? "Creating..." : "Create Tier"}
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
