"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Layers,
  Plus,
  RefreshCw,
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
import type { TierDto } from "@/modules/customers/application/types";
import type { PriceListDto } from "@/modules/pricing/application/types";

type ProductDto = { id: string; name: string; sku: string };

export default function PriceListsPage() {
  const [priceLists, setPriceLists] = useState<PriceListDto[] | null>(null);
  const [tiers, setTiers] = useState<TierDto[] | null>(null);
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTierId, setNewTierId] = useState("");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newItems, setNewItems] = useState<Array<{ productId: string; unitPrice: string }>>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Expand detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [plRes, tiersRes, prodsRes] = await Promise.all([
        apiRequest<PriceListDto[]>("/api/price-lists"),
        apiRequest<TierDto[]>("/api/customer-tiers").catch(() => []),
        apiRequest<ProductDto[]>("/api/products").catch(() => []),
      ]);
      setPriceLists(plRes);
      setTiers(tiersRes);
      setProducts(prodsRes);
      if (tiersRes.length > 0 && !newTierId) setNewTierId(tiersRes[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load price lists.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function addItem() {
    if (!products || products.length === 0) return;
    setNewItems([...newItems, { productId: products[0].id, unitPrice: "0" }]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const items = newItems
        .filter((item) => Number(item.unitPrice) > 0)
        .map((item) => ({
          productId: item.productId,
          unitPrice: Number(item.unitPrice),
        }));
      if (items.length === 0) {
        setCreateError("Add at least one item with a price.");
        setCreateSubmitting(false);
        return;
      }
      await apiRequest("/api/price-lists", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          tierId: newTierId,
          currency: newCurrency.toUpperCase(),
          items,
        }),
      });
      setIsCreating(false);
      setNewName("");
      setNewItems([]);
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create price list.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const totalItems = (priceLists ?? []).reduce((sum, pl) => sum + pl.items.length, 0);

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <DealFlowNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        {/* Header */}
        <section className="rounded-xl border border-sky-200 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-600 uppercase">
                Pricing Engine
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Price Lists
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Manage tier-based price lists. Each list maps products to unit prices
                for a specific customer tier and currency.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}
                className="border-sky-200 bg-white text-slate-800 hover:bg-sky-100">
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => { setIsCreating(true); if (newItems.length === 0) addItem(); }}
                className="bg-sky-500 font-medium text-white hover:bg-sky-400">
                <Plus className="mr-1.5 h-4 w-4" />
                New Price List
              </Button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Price Lists</span>
                <Layers className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{priceLists?.length ?? "—"}</div>
              <div className="mt-1 text-xs text-slate-500">Configured</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Items</span>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{totalItems}</div>
              <div className="mt-1 text-xs text-slate-500">Product price entries</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Active Lists</span>
                <Layers className="h-4 w-4 text-purple-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {(priceLists ?? []).filter((pl) => pl.isActive).length}
              </div>
              <div className="mt-1 text-xs text-slate-500">In use</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-700">{error}</div>
        )}

        {/* Price Lists */}
        <section className="rounded-xl border border-sky-100 bg-white p-6 shadow-xl">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading price lists...</div>
          ) : (priceLists ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No price lists configured.</div>
          ) : (
            <div className="space-y-4">
              {(priceLists ?? []).map((pl) => (
                <div key={pl.id} className="rounded-lg border border-sky-100 bg-sky-50 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === pl.id ? null : pl.id)}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-sky-50"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{pl.name}</p>
                        <p className="text-xs text-slate-500">
                          {pl.tier.name} · {pl.currency} · {pl.items.length} item{pl.items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={`border text-xs ${pl.isActive ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-600"}`}>
                        {pl.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <span className="text-xs text-slate-500">{expandedId === pl.id ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expandedId === pl.id && pl.items.length > 0 && (
                    <div className="border-t border-sky-100">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-sky-100 bg-sky-50">
                            <TableHead className="text-xs text-slate-600">Product</TableHead>
                            <TableHead className="text-right text-xs text-slate-600">Unit Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pl.items.map((item) => (
                            <TableRow key={item.id} className="border-sky-100">
                              <TableCell className="text-xs text-slate-900">{item.productName}</TableCell>
                              <TableCell className="text-right text-xs font-semibold text-emerald-600">
                                {pl.currency} {Number(item.unitPrice).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="border-b border-sky-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900">Create Price List</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">{createError}</div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Name</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Enterprise USD"
                      className="border-sky-100 bg-white text-slate-900" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Tier</Label>
                    <select value={newTierId} onChange={(e) => setNewTierId(e.target.value)}
                      className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900" required>
                      {(tiers ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Currency</Label>
                    <Input value={newCurrency} onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                      maxLength={3} placeholder="USD"
                      className="border-sky-100 bg-white text-slate-900" required />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-600">Price Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}
                      className="border-sky-100 text-xs text-slate-600">+ Add Item</Button>
                  </div>
                  {newItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2">
                      <select value={item.productId}
                        onChange={(e) => setNewItems(newItems.map((it, idx) => idx === i ? { ...it, productId: e.target.value } : it))}
                        className="rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900">
                        {(products ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                      <Input type="number" step="0.01" min="0" placeholder="Unit price"
                        value={item.unitPrice}
                        onChange={(e) => setNewItems(newItems.map((it, idx) => idx === i ? { ...it, unitPrice: e.target.value } : it))}
                        className="border-sky-100 bg-white text-slate-900" />
                      <Button type="button" variant="ghost" size="sm"
                        onClick={() => setNewItems(newItems.filter((_, idx) => idx !== i))}
                        className="text-rose-600 h-9 w-9 p-0">×</Button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreating(false)}
                    className="border-sky-100 text-slate-600 hover:bg-white">Cancel</Button>
                  <Button type="submit" disabled={createSubmitting}
                    className="bg-sky-500 font-semibold text-white hover:bg-sky-400">
                    {createSubmitting ? "Creating..." : "Create Price List"}
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
