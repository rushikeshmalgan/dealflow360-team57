/**
 * Shapes per DealFlow360_docs/API_DOCS.md SS11 (Product Catalog — Screens 16 & 17).
 * recurring_cycle follows the TAD/Prisma SubscriptionCadence enum (monthly/quarterly/yearly),
 * not the wireframe mockup's "Weekly" label, since the schema is the source of truth.
 */
export type ProductListItem = {
  id: string;
  name: string;
  category: string;
  variant_count: number;
  price: number;
  unit: string;
  tax_pct: number;
  status: string;
};

export type ProductsSummary = {
  total_products_count: number;
  pricelist_count: number;
  variant_count: number;
};

export type ProductVariant = {
  attribute: string;
  values: string[];
  extra_price: number;
};

export type ProductPricelist = {
  tier: string;
  currency: string;
  price_rule: string;
};

export type RecurringCycle = "monthly" | "quarterly" | "yearly";

export type ProductDetail = {
  id?: string;
  categoryId?: string;
  sku?: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  description: string;
  tax_pct: number;
  is_subscription: boolean;
  recurring_cycle: RecurringCycle | null;
  variants: ProductVariant[];
  pricelists: ProductPricelist[];
};

export const EMPTY_PRODUCT: ProductDetail = {
  name: "",
  category: "",
  price: 0,
  unit: "",
  description: "",
  tax_pct: 0,
  is_subscription: false,
  recurring_cycle: null,
  variants: [],
  pricelists: [],
};

/**
 * The actual wire shape GET /api/products and GET /api/products/:id return — see
 * src/modules/catalog/application/types.ts ProductDto. Decimal columns (price, costPrice,
 * taxPct, extraPrice) serialize as strings (Prisma Decimal -> JSON), category is the full
 * {id, name} relation, and variants are one row per attribute+value pair, not grouped.
 * The view types above are what the existing screens/components render; these mappers are the
 * one place that translates between the two so no component has to know about Decimal strings.
 */
export type ProductDto = {
  id: string;
  category: { id: string; name: string };
  sku: string;
  name: string;
  price: string;
  costPrice: string;
  unit: string;
  taxPct: string;
  description: string | null;
  isSubscription: boolean;
  recurringCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
  isActive: boolean;
  variants: Array<{
    id: string;
    attribute: string;
    value: string;
    extraPrice: string;
    sku: string | null;
    isActive: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
};

export function mapProductToListItem(dto: ProductDto): ProductListItem {
  return {
    id: dto.id,
    name: dto.name,
    category: dto.category.name,
    variant_count: dto.variants.length,
    price: Number(dto.price),
    unit: dto.unit,
    tax_pct: Number(dto.taxPct),
    status: dto.isActive ? "Active" : "Inactive",
  };
}

/**
 * Groups the backend's flat per-value variant rows back into one row per attribute, the shape
 * product-form.tsx's "comma separated values" editor expects. This is a lossless round-trip for
 * every product created through that form (it always writes one extraPrice per attribute group,
 * fanned out to each value) — it only loses per-value price differences if a product's variants
 * were seeded with different extraPrice per value under the same attribute, which nothing in
 * this app currently does.
 */
function groupVariants(variants: ProductDto["variants"]): ProductVariant[] {
  const byAttribute = new Map<string, ProductVariant>();
  for (const v of variants) {
    const existing = byAttribute.get(v.attribute);
    if (existing) {
      existing.values.push(v.value);
    } else {
      byAttribute.set(v.attribute, {
        attribute: v.attribute,
        values: [v.value],
        extra_price: Number(v.extraPrice),
      });
    }
  }
  return Array.from(byAttribute.values());
}

export function mapProductToDetail(
  dto: ProductDto,
  pricelists: ProductPricelist[] = [],
): ProductDetail {
  return {
    id: dto.id,
    categoryId: dto.category.id,
    sku: dto.sku,
    name: dto.name,
    category: dto.category.name,
    price: Number(dto.price),
    unit: dto.unit,
    description: dto.description ?? "",
    tax_pct: Number(dto.taxPct),
    is_subscription: dto.isSubscription,
    recurring_cycle: dto.recurringCycle
      ? (dto.recurringCycle.toLowerCase() as RecurringCycle)
      : null,
    variants: groupVariants(dto.variants),
    pricelists,
  };
}
