-- Product's catalog price is retained independently from tier/currency price-list rules.
ALTER TABLE "products" ADD COLUMN "price" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Prisma/PostgreSQL UNIQUE permits multiple NULL values. Collapse NULL to an
-- impossible UUID so there can be only one product-level rule per price list.
CREATE UNIQUE INDEX "price_list_items_rule_scope_key"
ON "price_list_items" (
  "price_list_id",
  "product_id",
  COALESCE("variant_id", '00000000-0000-0000-0000-000000000000'::uuid)
);
