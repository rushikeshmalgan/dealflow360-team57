"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { mapProductToListItem, type ProductDto, type ProductListItem } from "@/lib/products";
import type { PriceListDto } from "@/modules/pricing/application/types";
import type { CategoryDto } from "@/modules/catalog/application/types";

/**
 * Screen 16 (Product catalog). There is no /api/products/summary endpoint — the summary tiles
 * are derived client-side from the real /api/products and /api/price-lists responses instead,
 * so a hiccup fetching price lists degrades the "Pricelists" tile rather than blanking the whole
 * product table (the two used to be fetched with Promise.all, so either one failing hid the
 * other's data too).
 */
export default function ProductsPage() {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [pricelistCount, setPricelistCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);

  async function loadCategories() {
    try {
      setCategories(await apiRequest<CategoryDto[]>("/api/categories"));
    } catch (err) {
      setCategoryError(err instanceof ApiClientError ? err.message : "Failed to load categories.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const productDtos = await apiRequest<ProductDto[]>("/api/products");
        if (cancelled) return;
        setProducts(productDtos.map(mapProductToListItem));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : "Failed to load products.");
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const priceLists = await apiRequest<PriceListDto[]>("/api/price-lists");
        if (!cancelled) setPricelistCount(priceLists.length);
      } catch {
        // Pricelists tile falls back to its placeholder below; the product table above is
        // unaffected since this is a separate request now instead of a shared Promise.all.
      }

      if (!cancelled) await loadCategories();
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    setCategoryError(null);
    try {
      await apiRequest("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      setNewCategoryName("");
      await loadCategories();
    } catch (err) {
      setCategoryError(err instanceof ApiClientError ? err.message : "Failed to create category.");
    } finally {
      setCreatingCategory(false);
    }
  }

  const totalVariants = products?.reduce((sum, p) => sum + p.variant_count, 0) ?? undefined;

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
          <SummaryTile label="Total Products" value={products?.length} />
          <SummaryTile label="Pricelists" value={pricelistCount ?? undefined} />
          <SummaryTile label="Variants" value={totalVariants} />
        </div>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Categories</h2>
            <div className="flex flex-wrap gap-2">
              {categories === null ? (
                <p className="text-sm text-muted-foreground">Loading categories…</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No categories yet — add one below.</p>
              ) : (
                categories.map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {c.name}
                  </Badge>
                ))
              )}
            </div>
            <form onSubmit={handleCreateCategory} className="flex flex-wrap items-center gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name (e.g. Networking)"
                className="max-w-xs"
              />
              <Button type="submit" variant="outline" size="sm" disabled={creatingCategory}>
                {creatingCategory ? "Adding…" : "+ Add Category"}
              </Button>
            </form>
            {categoryError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {categoryError}
              </p>
            )}
          </CardContent>
        </Card>

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
