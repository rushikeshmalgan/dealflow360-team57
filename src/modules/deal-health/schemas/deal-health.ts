import { z } from "zod";

// Hardcoded (not derived from domain/types.ts's DEAL_HEALTH_ALERT_TYPES) so Zod infers the exact
// literal union DealHealthAlertType rather than widening to `string` - checked against the
// domain constant by the schema test below, so the two can't silently drift apart.
export const dealHealthAlertTypeSchema = z.enum([
  "STALLED_QUOTATION",
  "DISCOUNT_ANOMALY",
  "DELIVERY_SLIPPAGE",
  "HIGH_RISK_DEAL",
]);
export const dealHealthSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const dealHealthAlertStatusSchema = z.enum(["OPEN", "RESOLVED", "DISMISSED"]);

/** GET /api/deal-health query filters. `salesRepId` lets Manager/Admin/Finance narrow to one
 * rep; a Sales Rep's own scoping is enforced server-side and never taken from this input. */
export const dealHealthListQuerySchema = z.object({
  status: dealHealthAlertStatusSchema.optional(),
  type: dealHealthAlertTypeSchema.optional(),
  severity: dealHealthSeveritySchema.optional(),
  salesRepId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type DealHealthListQueryInput = z.infer<typeof dealHealthListQuerySchema>;

export const dismissAlertSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type DismissAlertInput = z.infer<typeof dismissAlertSchema>;
