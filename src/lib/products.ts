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
