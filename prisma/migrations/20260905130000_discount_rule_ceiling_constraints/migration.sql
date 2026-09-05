-- TAD SS10: "If both tier and category ceilings exist, use the lower ceiling" only
-- makes sense when each tier/category has at most one *active* ceiling to resolve.
-- App-level checks in PrismaDiscountRuleRepository already enforce this; these partial
-- unique indexes are the DB-level backstop against a concurrent duplicate insert,
-- mirroring the price_list_items_rule_scope_key pattern from the previous migration.
CREATE UNIQUE INDEX "discount_rules_active_tier_key"
ON "discount_rules" ("tier_id")
WHERE "scope" = 'TIER' AND "is_active" = true;

CREATE UNIQUE INDEX "discount_rules_active_category_key"
ON "discount_rules" ("category_id")
WHERE "scope" = 'CATEGORY' AND "is_active" = true;
