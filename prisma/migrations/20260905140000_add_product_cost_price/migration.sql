-- T6.4 needs a per-product cost basis to compute margin (TAD SS8 lists "Margin" as a data
-- dependency of the Discount and Risk module, but T0.2's schema never added the column).
-- Defaults to 0 so every existing/seeded product row remains valid without a backfill.
ALTER TABLE "products" ADD COLUMN "cost_price" DECIMAL(14,2) NOT NULL DEFAULT 0;
