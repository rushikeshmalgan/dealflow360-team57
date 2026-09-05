"use client";

import { useEffect, useState } from "react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { ProductForm } from "@/components/product-form";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ProductDetail } from "@/lib/products";

export function ProductDetailClient({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<ProductDetail>(`/api/products/${productId}`)
      .then((data) => {
        if (!cancelled) setProduct(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Failed to load product.");
        }
      });
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
