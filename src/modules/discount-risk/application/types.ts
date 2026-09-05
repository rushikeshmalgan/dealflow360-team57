import type { LimitingScope } from "../domain/resolve-ceiling";

export type DiscountRuleDto = {
  id: string;
  scope: "TIER" | "CATEGORY";
  tier: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  maxDiscountPct: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedCeilingDto = {
  tierId: string;
  categoryId: string | null;
  tierCeilingPct: string | null;
  categoryCeilingPct: string | null;
  allowedDiscountPct: string | null;
  limitingScope: LimitingScope;
};
