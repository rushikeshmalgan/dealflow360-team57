"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DealFlowNav } from "@/components/dealflow-nav";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ProductDetail, ProductVariant, RecurringCycle } from "@/lib/products";

type ProductFormProps = {
  mode: "create" | "edit";
  productId?: string;
  initialProduct: ProductDetail;
};

/**
 * Screen 17 (Product and pricelist). Variants are owned by the Product module (T2.1) so they're
 * editable and saved here; pricelists are owned by the separate Price List module (T2.3's
 * PricingService) so they're shown read-only rather than duplicating that write path.
 */
export function ProductForm({ mode, productId, initialProduct }: ProductFormProps) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail>(initialProduct);
  const [quantityOnHand, setQuantityOnHand] = useState("");
  const [categoryId, setCategoryId] = useState(initialProduct.categoryId ?? "");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populates the Category dropdown below (Catalog module, GET /api/categories) for both create
  // and edit — previously this only ran on create, to silently auto-pick categories[0] into a
  // categoryId that had no visible control, so a product's category could never actually be
  // changed from this screen.
  useEffect(() => {
    apiRequest<{ id: string; name: string }[]>("/api/categories")
      .then((fetched) => {
        setCategories(fetched);
        setCategoryId((current) => current || fetched[0]?.id || "");
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Failed to load categories."));
  }, []);

  function updateField<K extends keyof ProductDetail>(key: K, value: ProductDetail[K]) {
    setProduct((prev) => ({ ...prev, [key]: value }));
  }

  function updateVariant(index: number, patch: Partial<ProductVariant>) {
    setProduct((prev) => ({
      ...prev,
      variants: prev.variants.map((variant, i) =>
        i === index ? { ...variant, ...patch } : variant,
      ),
    }));
  }

  function addVariant() {
    setProduct((prev) => ({
      ...prev,
      variants: [...prev.variants, { attribute: "", values: [], extra_price: 0 }],
    }));
  }

  function removeVariant(index: number) {
    setProduct((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (mode === "create" && (!categoryId || !product.sku?.trim())) {
        throw new ApiClientError({
          code: "VALIDATION_ERROR",
          message: "SKU and a product category are required.",
        });
      }
      const payload = {
        ...(categoryId ? { categoryId } : {}),
        ...(product.sku?.trim() ? { sku: product.sku.trim() } : {}),
        name: product.name,
        price: product.price,
        costPrice: 0,
        unit: product.unit,
        description: product.description,
        taxPct: product.tax_pct * 100,
        isSubscription: product.is_subscription,
        recurringCycle: product.is_subscription
          ? product.recurring_cycle?.toUpperCase()
          : null,
        variants: product.variants.flatMap((variant) =>
          variant.values.map((value) => ({
            attribute: variant.attribute,
            value,
            extraPrice: variant.extra_price,
          })),
        ),
      };
      if (mode === "create") {
        const created = await apiRequest<{ id: string }>("/api/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        router.push(`/products/${created.id}`);
      } else {
        await apiRequest(`/api/products/${productId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-secondary">
      <DealFlowNav />
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Product and pricelist</h1>
            <p className="text-sm text-muted-foreground">
              {mode === "create" ? "Create a new product." : "General Info"}
            </p>
          </div>
          <Link href="/products" className="text-sm text-primary hover:underline">
            Back to Products
          </Link>
        </div>

        <Card>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4">
              <Field label="Product name">
                <Input value={product.name} onChange={(e) => updateField("name", e.target.value)} />
              </Field>
              <Field label="SKU">
                <Input
                  value={product.sku ?? ""}
                  onChange={(e) => updateField("sku", e.target.value)}
                  placeholder="e.g. HW-LAP-001"
                />
              </Field>
              <Field label="Category">
                <Select
                  value={categoryId || undefined}
                  onValueChange={(value) => {
                    if (!value) return;
                    setCategoryId(value);
                    const name = categories.find((c) => c.id === value)?.name ?? "";
                    updateField("category", name);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Price">
                <Input
                  type="number"
                  step="0.01"
                  value={product.price}
                  onChange={(e) => updateField("price", Number(e.target.value))}
                />
              </Field>
              <Field label="Unit">
                <Input value={product.unit} onChange={(e) => updateField("unit", e.target.value)} />
              </Field>
              <Field label="Description">
                <Textarea
                  value={product.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={3}
                />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="Tax %">
                <Input
                  type="number"
                  step="0.01"
                  value={product.tax_pct * 100}
                  onChange={(e) => updateField("tax_pct", Number(e.target.value) / 100)}
                />
              </Field>
              <Field label="Subscription">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={product.is_subscription}
                    onCheckedChange={(checked) => updateField("is_subscription", checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {product.is_subscription ? "Yes" : "No"} — if subscription, recurring cadence is
                    shown below
                  </span>
                </div>
              </Field>
              {product.is_subscription && (
                <Field label="Recurring">
                  <Select
                    value={product.recurring_cycle ?? null}
                    onValueChange={(value) =>
                      updateField("recurring_cycle", value as RecurringCycle)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select cadence" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Quantity on hand">
                <Input
                  type="number"
                  value={quantityOnHand}
                  onChange={(e) => setQuantityOnHand(e.target.value)}
                  title="Stock is tracked per warehouse (Fulfillment module), not on the product record itself — not sent when saving."
                />
                <p className="mt-1 text-xs text-muted-foreground">(Integer field)</p>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Product Variants</h2>
              <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                + Add Variant
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Attribute</TableHead>
                  <TableHead>Values</TableHead>
                  <TableHead>Extra price</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No variants yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  product.variants.map((variant, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={variant.attribute}
                          onChange={(e) => updateVariant(index, { attribute: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={variant.values.join(", ")}
                          onChange={(e) =>
                            updateVariant(index, {
                              values: e.target.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="Comma separated, e.g. Blue, Black"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={variant.extra_price}
                          onChange={(e) =>
                            updateVariant(index, { extra_price: Number(e.target.value) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVariant(index)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-muted-foreground">Pricelists</h2>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Price Rule</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.pricelists.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No price list entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  product.pricelists.map((pricelist, index) => (
                    <TableRow key={index}>
                      <TableCell>{pricelist.tier}</TableCell>
                      <TableCell>{pricelist.currency}</TableCell>
                      <TableCell>{pricelist.price_rule}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              Price lists are managed on the Price List screen and shown here read-only.
            </p>
          </CardContent>
        </Card>

        <p className="rounded-md border border-accent bg-accent/20 px-3 py-2 text-sm text-accent-foreground">
          Product details should be filled. Recurring order with this product will be invoiced at
          the beginning of the period.
        </p>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
