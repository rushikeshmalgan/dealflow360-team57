/**
 * Placeholder shipping estimation — docs/ORDERS_FLOW.md and API_DOCS.md both show `cost` and
 * `est_shipment_date` on the suggested split without specifying a rate/lead-time model (no
 * carrier-rate or logistics ticket exists in this codebase yet). Rather than leaving these
 * fields unpopulated or fabricating them ad hoc at each call site, this is one documented,
 * versioned, pure function — the same pattern src/modules/discount-risk/domain/scoreRisk.ts
 * uses for its own otherwise-unspecified weights (`RISK_CONFIG_V1`). Replace `CONFIG_V1` (and
 * bump its version) when a real rate card/lead-time source exists; nothing else should need to
 * change since every caller goes through the two functions below.
 *
 * `shippingCostWeight` is Warehouse's own existing column (schema.prisma), added for exactly
 * this purpose and otherwise unused anywhere in the codebase until now.
 */

export const SHIPPING_ESTIMATE_CONFIG_V1 = {
  version: 1,
  /** Placeholder flat USD rate per unit before the warehouse's cost weight is applied. */
  baseCostPerUnit: 10,
  leadTimeDays: 5,
};

export function estimateShippingCost(
  quantity: number,
  shippingCostWeight: number,
  config = SHIPPING_ESTIMATE_CONFIG_V1,
): number {
  return quantity * config.baseCostPerUnit * shippingCostWeight;
}

export function estimateShipmentDate(from: Date, config = SHIPPING_ESTIMATE_CONFIG_V1): Date {
  return new Date(from.getTime() + config.leadTimeDays * 24 * 60 * 60 * 1000);
}
