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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DealFlowNav } from "@/components/dealflow-nav";
import { ApiClientError, apiRequest } from "@/lib/api-client";

export type Warehouse = {
  id: string;
  name: string;
  replenishmentRule: { reorderThreshold?: number; targetStock?: number } | null;
  shippingCostWeight: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseStockItem = {
  id: string;
  warehouse: { id: string; name: string };
  product: { id: string; name: string; sku: string };
  availableQty: number;
  reservedQty: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
};

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockItems, setStockItems] = useState<WarehouseStockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New Warehouse Form State
  const [isCreatingWarehouse, setIsCreatingWarehouse] = useState(false);
  const [whName, setWhName] = useState("");
  const [whWeight, setWhWeight] = useState("1.00");
  const [whReorder, setWhReorder] = useState("10");
  const [whTarget, setWhTarget] = useState("50");
  const [submittingWh, setSubmittingWh] = useState(false);

  // Stock Adjustment Form State
  const [targetWarehouseId, setTargetWarehouseId] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [adjustAvailable, setAdjustAvailable] = useState<number>(50);
  const [adjustReserved, setAdjustReserved] = useState<number>(0);
  const [submittingStock, setSubmittingStock] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [whData, stockData, prodData] = await Promise.all([
        apiRequest<Warehouse[]>("/api/warehouses"),
        apiRequest<WarehouseStockItem[]>("/api/warehouse-stock"),
        apiRequest<{ id: string; name: string; sku: string }[]>("/api/products").catch(() => []),
      ]);
      setWarehouses(whData);
      setStockItems(stockData);
      setProducts(prodData);
      if (whData.length > 0 && !targetWarehouseId) {
        setTargetWarehouseId(whData[0].id);
      }
      if (prodData.length > 0 && !targetProductId) {
        setTargetProductId(prodData[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load warehouse data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateWarehouse(e: React.FormEvent) {
    e.preventDefault();
    if (!whName.trim()) return;
    setSubmittingWh(true);
    setError(null);
    try {
      await apiRequest<Warehouse>("/api/warehouses", {
        method: "POST",
        body: JSON.stringify({
          name: whName.trim(),
          shippingCostWeight: parseFloat(whWeight) || 1.0,
          replenishmentRule: {
            reorderThreshold: parseInt(whReorder, 10) || 0,
            targetStock: parseInt(whTarget, 10) || 0,
          },
          isActive: true,
        }),
      });
      setWhName("");
      setWhWeight("1.00");
      setIsCreatingWarehouse(false);
      setSuccessMessage("Warehouse created successfully!");
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create warehouse");
    } finally {
      setSubmittingWh(false);
    }
  }

  async function handleUpdateStock(e: React.FormEvent) {
    e.preventDefault();
    if (!targetWarehouseId || !targetProductId) {
      setError("Please select both a warehouse and a product");
      return;
    }
    if (adjustReserved > adjustAvailable) {
      setError("Validation Error: Reserved quantity cannot exceed available quantity (enforced by DB check constraint)");
      return;
    }

    setSubmittingStock(true);
    setError(null);
    try {
      await apiRequest("/api/warehouse-stock/import", {
        method: "POST",
        body: JSON.stringify({
          warehouseId: targetWarehouseId,
          items: [
            {
              productId: targetProductId,
              availableQty: adjustAvailable,
              reservedQty: adjustReserved,
            },
          ],
        }),
      });
      setSuccessMessage("Stock updated successfully!");
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update stock");
    } finally {
      setSubmittingStock(false);
    }
  }

  const filteredStock = selectedWarehouseFilter === "ALL"
    ? stockItems
    : stockItems.filter((s) => s.warehouse.id === selectedWarehouseFilter);

  const totalAvailable = stockItems.reduce((acc, curr) => acc + curr.availableQty, 0);
  const totalReserved = stockItems.reduce((acc, curr) => acc + curr.reservedQty, 0);
  const lowStockCount = stockItems.filter((s) => (s.availableQty - s.reservedQty) < 15).length;

  return (
    <div className="min-h-screen bg-[#171b22] text-slate-100">
      <DealFlowNav />
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Header section */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Warehouse & Stock Management
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Epic 4: Configure distribution centers, shipping cost weightings, and real-time inventory allocation.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setIsCreatingWarehouse(!isCreatingWarehouse)}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
            >
              {isCreatingWarehouse ? "Cancel" : "+ Add Warehouse"}
            </Button>
            <Button variant="outline" onClick={loadData} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300">
            {successMessage}
          </div>
        )}

        {/* KPI Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Warehouses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {warehouses.filter((w) => w.isActive).length}
              </div>
              <p className="text-xs text-slate-400 mt-1">Total distribution hubs</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Available Units
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {totalAvailable}
              </div>
              <p className="text-xs text-slate-400 mt-1">Across all active hubs</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Reserved for Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {totalReserved}
              </div>
              <p className="text-xs text-slate-400 mt-1">Pending quotation dispatch</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Low Stock SKUs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">
                {lowStockCount}
              </div>
              <p className="text-xs text-slate-400 mt-1">Below reorder threshold</p>
            </CardContent>
          </Card>
        </div>

        {/* Inline Create Warehouse Form */}
        {isCreatingWarehouse && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-blue-950 dark:text-blue-200">
                Add New Distribution Warehouse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateWarehouse} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-medium">Warehouse Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Warehouse D (South Hub)"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="weight" className="text-xs font-medium">Shipping Cost Weight</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.05"
                    min="0.1"
                    placeholder="1.00"
                    value={whWeight}
                    onChange={(e) => setWhWeight(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reorder" className="text-xs font-medium">Reorder Threshold</Label>
                  <Input
                    id="reorder"
                    type="number"
                    min="0"
                    placeholder="10"
                    value={whReorder}
                    onChange={(e) => setWhReorder(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="target" className="text-xs font-medium">Target Stock Level</Label>
                  <Input
                    id="target"
                    type="number"
                    min="0"
                    placeholder="50"
                    value={whTarget}
                    onChange={(e) => setWhTarget(e.target.value)}
                  />
                </div>
                <div className="col-span-full flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreatingWarehouse(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submittingWh} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {submittingWh ? "Saving..." : "Save Warehouse"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="stock" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="stock">Live Stock</TabsTrigger>
            <TabsTrigger value="warehouses">Warehouses ({warehouses.length})</TabsTrigger>
            <TabsTrigger value="adjust">Stock Adjustments</TabsTrigger>
          </TabsList>

          {/* TAB 1: LIVE INVENTORY */}
          <TabsContent value="stock" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="wh-filter" className="text-xs font-medium text-slate-500">Filter Hub:</Label>
                <select
                  id="wh-filter"
                  className="h-9 rounded-md border border-slate-700 bg-[#101f33] px-3 py-1 text-sm text-slate-100"
                  value={selectedWarehouseFilter}
                  onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                >
                  <option value="ALL">All Warehouses</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-slate-400">
                Showing {filteredStock.length} SKU record{filteredStock.length === 1 ? "" : "s"}
              </span>
            </div>

            <Card className="border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Product SKU & Name</TableHead>
                    <TableHead className="text-right">Available Qty</TableHead>
                    <TableHead className="text-right">Reserved Qty</TableHead>
                    <TableHead className="text-right">Net Sellable</TableHead>
                    <TableHead>Stock Level</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStock.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                        No stock records found. Use the Stock Adjustments tab to seed initial inventory.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStock.map((item) => {
                      const netSellable = item.availableQty - item.reservedQty;
                      const ratio = item.availableQty > 0 ? (item.reservedQty / item.availableQty) * 100 : 0;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                            {item.warehouse.name}
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.product.name}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">
                              {item.product.sku}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {item.availableQty}
                          </TableCell>
                          <TableCell className="text-right font-mono text-amber-600">
                            {item.reservedQty}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-600">
                            {netSellable}
                          </TableCell>
                          <TableCell className="w-36">
                            <div className="space-y-1">
                              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(10, (netSellable / (item.availableQty || 1)) * 100))}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {ratio.toFixed(0)}% reserved
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {netSellable <= 0 ? (
                              <Badge variant="destructive">Depleted</Badge>
                            ) : netSellable < 15 ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300">
                                Low Stock
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300">
                                Healthy
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* TAB 2: WAREHOUSE DIRECTORY */}
          <TabsContent value="warehouses" className="space-y-4">
            <Card className="border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse Name</TableHead>
                    <TableHead>Shipping Multiplier</TableHead>
                    <TableHead>Replenishment Rule</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((wh) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                        {wh.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {parseFloat(wh.shippingCostWeight).toFixed(2)}x
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300 font-mono">
                        {wh.replenishmentRule ? (
                          `Reorder < ${wh.replenishmentRule.reorderThreshold ?? "—"} | Target: ${wh.replenishmentRule.targetStock ?? "—"}`
                        ) : (
                          <span className="text-slate-400">Default policy</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {wh.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-400">
                        {new Date(wh.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* TAB 3: STOCK ADJUSTMENT & BATCH IMPORT */}
          <TabsContent value="adjust" className="space-y-4">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Update Stock Levels (Atomic Import)
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Updates inventory records. Note that PostgreSQL enforces the invariant:{" "}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">
                    CHECK (available_qty &gt;= reserved_qty)
                  </code>.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateStock} className="max-w-xl space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="adjust-wh" className="text-xs font-medium">Target Warehouse</Label>
                    <select
                      id="adjust-wh"
                      className="w-full h-10 rounded-md border border-slate-700 bg-[#101f33] px-3 py-2 text-sm text-slate-100"
                      value={targetWarehouseId}
                      onChange={(e) => setTargetWarehouseId(e.target.value)}
                      required
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="adjust-prod" className="text-xs font-medium">Target Product</Label>
                    <select
                      id="adjust-prod"
                      className="w-full h-10 rounded-md border border-slate-700 bg-[#101f33] px-3 py-2 text-sm text-slate-100"
                      value={targetProductId}
                      onChange={(e) => setTargetProductId(e.target.value)}
                      required
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="avail" className="text-xs font-medium">Available Quantity</Label>
                      <Input
                        id="avail"
                        type="number"
                        min="0"
                        value={adjustAvailable}
                        onChange={(e) => setAdjustAvailable(parseInt(e.target.value, 10) || 0)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="resv" className="text-xs font-medium">Reserved Quantity</Label>
                      <Input
                        id="resv"
                        type="number"
                        min="0"
                        value={adjustReserved}
                        onChange={(e) => setAdjustReserved(parseInt(e.target.value, 10) || 0)}
                        required
                      />
                    </div>
                  </div>

                  {adjustReserved > adjustAvailable && (
                    <p className="text-xs font-semibold text-red-600">
                      ⚠️ Reserved quantity ({adjustReserved}) exceeds available quantity ({adjustAvailable}).
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={submittingStock || adjustReserved > adjustAvailable}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {submittingStock ? "Updating..." : "Commit Stock Adjustment"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
