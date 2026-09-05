import { describe, expect, it } from "vitest";

import { parseRealtimeEventPayload, REALTIME_EVENT_NAMES } from "@/realtime/events";

describe("parseRealtimeEventPayload", () => {
  it("accepts a minimal, well-formed payload for every event", () => {
    const samples: Record<string, unknown> = {
      "quotation:created": { id: "q1", version: 1, status: "DRAFT" },
      "quotation:updated": { id: "q1", changedFields: ["status"] },
      "approval:created": { approvalId: "a1", quotationId: "q1", status: "PENDING" },
      "approval:updated": { approvalId: "a1", quotationId: "q1", status: "APPROVED" },
      "negotiation:created": { id: "n1", quotationId: "q1", status: "PENDING" },
      "negotiation:updated": { id: "n1", quotationId: "q1", status: "ACCEPTED", version: 2 },
      "stock:updated": { productId: "p1", warehouseId: "w1", availableQty: 5 },
      "fulfillment:updated": { fulfillmentId: "f1", quotationId: "q1", status: "ALLOCATED" },
      "invoice:updated": { invoiceId: "i1", quotationId: "q1", status: "ISSUED" },
      "payment:recorded": { paymentId: "p1", invoiceId: "i1", invoiceStatus: "PAID" },
      "deal-health:updated": { alertId: "d1", type: "STALLED", priority: "HIGH" },
      "recommendation:updated": { quotationId: "q1", productIds: ["p1", "p2"] },
      "document:updated": { documentId: "doc1", version: 3 },
      "document:presence": { documentId: "doc1", userId: "u1", status: "joined" },
      "export:queued": { exportId: "e1", status: "QUEUED", format: "PDF" },
      "export:ready": { exportId: "e1", status: "READY", format: "XLSX" },
      "export:failed": { exportId: "e1", status: "FAILED", format: "PDF" },
    };

    expect(Object.keys(samples).sort()).toEqual([...REALTIME_EVENT_NAMES].sort());

    for (const event of REALTIME_EVENT_NAMES) {
      expect(() => parseRealtimeEventPayload(event, samples[event])).not.toThrow();
    }
  });

  it("rejects a payload missing a required field", () => {
    expect(() => parseRealtimeEventPayload("payment:recorded", { paymentId: "p1" })).toThrow();
  });

  it("strips fields outside the schema (e.g. an accidentally-included secret)", () => {
    const parsed = parseRealtimeEventPayload("invoice:updated", {
      invoiceId: "i1",
      status: "PAID",
      // Never part of the schema - must not survive parsing.
      customerEmail: "someone@example.com",
      internalNotes: "do not leak this",
    });

    expect(parsed).toEqual({ invoiceId: "i1", status: "PAID" });
    expect(parsed).not.toHaveProperty("customerEmail");
    expect(parsed).not.toHaveProperty("internalNotes");
  });

  it("rejects the wrong literal status for a fixed-status event", () => {
    expect(() =>
      parseRealtimeEventPayload("export:queued", { exportId: "e1", status: "READY", format: "PDF" }),
    ).toThrow();
  });
});
