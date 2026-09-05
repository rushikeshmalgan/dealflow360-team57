"use client";

import { useEffect, useState } from "react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { ProductForm } from "@/components/product-form";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { mapProductToDetail, type ProductDetail, type ProductDto, type ProductPricelist } from "@/lib/products";
import type { PriceListDto } from "@/modules/pricing/application/types";

export function ProductDetailClient({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const dto = await apiRequest<ProductDto>(`/api/products/${productId}`);
        if (cancelled) return;

        // Price lists are owned by the Pricing module (GET /api/price-lists), not embedded in
        // the product DTO — fetch them separately and pick out this product's rows. A failure
        // here shouldn't block showing the product itself, so it falls back to an empty list.
        let pricelists: ProductPricelist[] = [];
        try {
          const priceLists = await apiRequest<PriceListDto[]>("/api/price-lists");
          pricelists = priceLists.flatMap((list) =>
            list.items
              .filter((item) => item.productId === productId)
              .map((item) => ({
                tier: list.tier.name,
                currency: list.currency,
                price_rule: `${item.unitPrice} ${list.currency}`,
              })),
          );
        } catch {
          // Pricelists table just shows "No price list entries yet." below.
        }

        if (!cancelled) setProduct(mapProductToDetail(dto, pricelists));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Failed to load product.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (error) {
    return (
      <div className="min-h-screen bg-secondary">
        <DealFlowNav />
        <main className="mx-auto max-w-5xl p-6">
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-secondary">
        <DealFlowNav />
        <main className="mx-auto max-w-5xl p-6">
          <p className="text-sm text-muted-foreground">Loading product…</p>
        </main>
      </div>
    );
  }

  return <ProductForm mode="edit" productId={productId} initialProduct={product} />;
}
