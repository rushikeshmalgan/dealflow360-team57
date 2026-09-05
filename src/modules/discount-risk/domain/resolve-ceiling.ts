/**
 * Pure domain logic for combining tier and category discount ceilings.
 * TAD SS10: "If both tier and category ceilings exist, use the lower ceiling."
 * No Next.js/Prisma dependency (TAD SS31) so this is the single implementation every
 * caller (this module's own read path today; T6.4/T7.2's line evaluation later) imports
 * rather than re-deriving.
 */

export type CeilingInputs = {
  tierCeilingPct: number | null;
  categoryCeilingPct: number | null;
};

export type LimitingScope = "TIER" | "CATEGORY" | "BOTH" | null;

export type ResolvedCeiling = {
  tierCeilingPct: number | null;
  categoryCeilingPct: number | null;
  /** The effective allowed discount percentage, or null when no rule is configured for either scope. */
  allowedDiscountPct: number | null;
  limitingScope: LimitingScope;
};

export function resolveDiscountCeiling({ tierCeilingPct, categoryCeilingPct }: CeilingInputs): ResolvedCeiling {
  if (tierCeilingPct == null && categoryCeilingPct == null) {
    return { tierCeilingPct: null, categoryCeilingPct: null, allowedDiscountPct: null, limitingScope: null };
  }
  if (tierCeilingPct == null) {
    return { tierCeilingPct: null, categoryCeilingPct, allowedDiscountPct: categoryCeilingPct, limitingScope: "CATEGORY" };
  }
  if (categoryCeilingPct == null) {
    return { tierCeilingPct, categoryCeilingPct: null, allowedDiscountPct: tierCeilingPct, limitingScope: "TIER" };
  }
  if (tierCeilingPct === categoryCeilingPct) {
    return { tierCeilingPct, categoryCeilingPct, allowedDiscountPct: tierCeilingPct, limitingScope: "BOTH" };
  }
  const limitingScope: LimitingScope = tierCeilingPct < categoryCeilingPct ? "TIER" : "CATEGORY";
  return {
    tierCeilingPct,
    categoryCeilingPct,
    allowedDiscountPct: Math.min(tierCeilingPct, categoryCeilingPct),
    limitingScope,
  };
}
