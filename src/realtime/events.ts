import { z } from "zod";

/**
 * Typed realtime event contract (TAD SS23). Every payload is intentionally minimal - ids,
 * status, version, and changed fields only. Never secrets, full customer datasets, or
 * unrelated quotation details. Clients must treat the payload as a hint to refetch via REST,
 * never as the authoritative value (see src/hooks/use-realtime.ts).
 */
export const REALTIME_EVENT_NAMES = [
  "quotation:created",
  "quotation:updated",
  "approval:created",
  "approval:updated",
  "negotiation:created",
  "negotiation:updated",
  "stock:updated",
  "fulfillment:updated",
  "invoice:updated",
  "payment:recorded",
  "deal-health:updated",
  "recommendation:updated",
  "document:updated",
  "document:presence",
  "export:queued",
  "export:ready",
  "export:failed",
] as const;

export type RealtimeEventName = (typeof REALTIME_EVENT_NAMES)[number];

const id = z.string().min(1).max(200);
const status = z.string().min(1).max(50);
const version = z.number().int().nonnegative();
const exportFormat = z.enum(["PDF", "XLSX"]);

const quotationLifecycleSchema = z.object({
  id,
  version: version.optional(),
  status: status.optional(),
  changedFields: z.array(z.string().min(1).max(100)).max(20).optional(),
});

const negotiationLifecycleSchema = z.object({
  id,
  quotationId: id,
  status,
  version: version.optional(),
});

/** One Zod schema per event - the single source of truth for "what this event may carry". */
export const REALTIME_EVENT_SCHEMAS = {
  "quotation:created": quotationLifecycleSchema,
  "quotation:updated": quotationLifecycleSchema,
  "approval:created": z.object({ approvalId: id, quotationId: id, status }),
  "approval:updated": z.object({ approvalId: id, quotationId: id, status }),
  "negotiation:created": negotiationLifecycleSchema,
  "negotiation:updated": negotiationLifecycleSchema,
  "stock:updated": z.object({ productId: id, warehouseId: id, availableQty: z.number().int().nonnegative() }),
  "fulfillment:updated": z.object({ fulfillmentId: id, quotationId: id, status }),
  "invoice:updated": z.object({ invoiceId: id, quotationId: id.optional(), status }),
  "payment:recorded": z.object({ paymentId: id, invoiceId: id, invoiceStatus: status }),
  "deal-health:updated": z.object({ alertId: id, type: status, priority: status }),
  "recommendation:updated": z.object({
    quotationId: id,
    productIds: z.array(id).max(10),
    explanationCodes: z.array(z.string().min(1).max(50)).max(10).optional(),
  }),
  "document:updated": z.object({ documentId: id, version }),
  "document:presence": z.object({ documentId: id, userId: id, status: z.enum(["joined", "left", "editing"]) }),
  "export:queued": z.object({ exportId: id, status: z.literal("QUEUED"), format: exportFormat }),
  "export:ready": z.object({ exportId: id, status: z.literal("READY"), format: exportFormat }),
  "export:failed": z.object({ exportId: id, status: z.literal("FAILED"), format: exportFormat }),
} as const satisfies Record<RealtimeEventName, z.ZodType>;

export type RealtimeEventPayload<E extends RealtimeEventName> = z.infer<(typeof REALTIME_EVENT_SCHEMAS)[E]>;

/**
 * Validates (and strips unknown fields from) a payload before it is ever emitted or trusted.
 * Throws on an invalid payload - a producer bug, not a client-input problem, so callers should
 * fail loudly in development and refuse to emit in production (see emit.ts).
 */
export function parseRealtimeEventPayload<E extends RealtimeEventName>(
  event: E,
  payload: unknown,
): RealtimeEventPayload<E> {
  return REALTIME_EVENT_SCHEMAS[event].parse(payload) as RealtimeEventPayload<E>;
}
