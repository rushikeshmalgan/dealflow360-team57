/**
 * Pure domain logic for T6.4: sequential line/order discount combination and margin.
 * TAD SS10: `effectiveDiscount = 1 - (1 - lineDiscount) * (1 - orderDiscount)`.
 * No Next.js/Prisma dependency (TAD SS31) — the single implementation T6.5's live-margin
 * display and T7.1's risk scoring (which needs `excess_i`/`valueWeight_i` per line) both
 * import rather than re-deriving. Percentages are 0-100 throughout, matching resolve-ceiling.ts
 * and the API/DTO layer; Decimal<->number conversion happens at the persistence boundary.
 */

export type CombineDiscountsInput = {
  lineDiscountPct: number;
  orderDiscountPct: number;
};

/** `effectiveDiscount = 1 - (1 - lineDiscount) * (1 - orderDiscount)`, as a 0-100 percentage. */
export function combineDiscounts({
  lineDiscountPct,
  orderDiscountPct,
}: CombineDiscountsInput): number {
  const line = lineDiscountPct / 100;
  const order = orderDiscountPct / 100;
  return (1 - (1 - line) * (1 - order)) * 100;
}

export type LineMarginInput = {
  unitPrice: number;
  quantity: number;
  /** Unit cost basis (Product.costPrice); 0 for products with no configured cost. */
  unitCost: number;
  lineDiscountPct: number;
  orderDiscountPct: number;
};

export type LineMarginResult = {
  effectiveDiscountPct: number;
  /** Line revenue before tax, after the combined discount — `lineNetBeforeTax_i` in TAD SS10. */
  netBeforeTax: number;
  costTotal: number;
  marginAmount: number;
  /** Null (undefined, not zero) when netBeforeTax is 0 — a fully-discounted or zero-price line. */
  marginPct: number | null;
};

export function calculateLineMargin(input: LineMarginInput): LineMarginResult {
  const effectiveDiscountPct = combineDiscounts(input);
  const grossBeforeDiscount = input.unitPrice * input.quantity;
  const netBeforeTax = grossBeforeDiscount * (1 - effectiveDiscountPct / 100);
  const costTotal = input.unitCost * input.quantity;
  const marginAmount = netBeforeTax - costTotal;
  const marginPct = netBeforeTax === 0 ? null : (marginAmount / netBeforeTax) * 100;
  return { effectiveDiscountPct, netBeforeTax, costTotal, marginAmount, marginPct };
}

export type QuotationMarginResult = {
  /** `quoteNetBeforeTax` in TAD SS10 — the denominator for each line's `valueWeight_i`. */
  totalNetBeforeTax: number;
  totalCost: number;
  totalMarginAmount: number;
  /** `quoteMargin` in TAD SS10's `marginPressure` term. Null when the quote has no revenue. */
  marginPct: number | null;
};

export function calculateQuotationMargin(
  lines: readonly LineMarginResult[],
): QuotationMarginResult {
  const totalNetBeforeTax = lines.reduce((sum, line) => sum + line.netBeforeTax, 0);
  const totalCost = lines.reduce((sum, line) => sum + line.costTotal, 0);
  const totalMarginAmount = totalNetBeforeTax - totalCost;
  const marginPct = totalNetBeforeTax === 0 ? null : (totalMarginAmount / totalNetBeforeTax) * 100;
  return { totalNetBeforeTax, totalCost, totalMarginAmount, marginPct };
}
