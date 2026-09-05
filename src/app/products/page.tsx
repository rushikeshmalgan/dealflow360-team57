"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { ProductListItem, ProductsSummary } from "@/lib/products";

/** Screen 16 (Product catalog). GET /api/products and GET /api/products/summary per API_DOCS.md SS11. */
export default function ProductsPage() {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [summary, setSummary] = useState<ProductsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [productList, productSummary] = await Promise.all([
          apiRequest<ProductListItem[]>("/api/products"),
          apiRequest<ProductsSummary>("/api/products/summary"),
        ]);
        if (cancelled) return;
        setProducts(productList);
        setSummary(productSummary);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : "Failed to load products.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-secondary">
      <DealFlowNav />
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Product catalog</h1>
            <p className="text-sm text-muted-foreground">
              Every product, variant and price list in one place.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/products/new" className={buttonVariants({ variant: "default" })}>
              + New Product
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled
              title="Price list field configuration is managed in a separate screen (not yet built)."
            >
              Manage Price fields
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryTile label="Total Products" value={summary?.total_products_count} />
          <SummaryTile label="Pricelists" value={summary?.pricelist_count} />
          <SummaryTile label="Variants" value={summary?.variant_count} />
        </div>

        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Products</h2>
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading products…</p>
            ) : error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : !products || products.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No products yet. Click “+ New Product” to add one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/products/${product.id}`} className="block font-medium">
                          {product.name}
                        </Link>
                      </TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>{product.variant_count}</TableCell>
                      <TableCell>${product.price.toFixed(2)}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell>{(product.tax_pct * 100).toFixed(0)}%</TableCell>
                      <TableCell>
                        <Badge variant={product.status === "Active" ? "default" : "secondary"}>
                          {product.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="rounded-md border border-accent bg-accent/20 px-3 py-2 text-sm text-accent-foreground">
          Click a product row to open general info, variants and tier/currency price lists.
        </p>
      </main>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}
