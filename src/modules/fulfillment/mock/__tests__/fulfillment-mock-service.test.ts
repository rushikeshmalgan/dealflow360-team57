import { describe, expect, it } from "vitest";

/**
 * Order & Fulfillment UI (Stage 1) — no rendering-test infra exists anywhere in this codebase
 * (vitest.config.ts runs `environment: "node"`, and no module here uses @testing-library/react),
 * so these tests exercise the mock adapter that backs the UI instead of mounting components —
 * the same approach every other module's "service" tests take (e.g. quotation-service.test.ts).
 * `getFulfillmentService()` returns a shared module-level singleton (by design, so state
 * persists across client-side navigations); tests instead construct `MockFulfillmentServiceImpl`
 * directly for a clean, isolated in-memory store per test. Together the fixtures cover the
 * order/fulfillment/shipment/backorder/delivery/billing/timeline states the UI must render.
 */
import { MockFulfillmentServiceError, MockFulfillmentServiceImpl } from "../fulfillment-mock-service";

function freshService(): MockFulfillmentServiceImpl {
  return new MockFulfillmentServiceImpl();
}

describe("MockFulfillmentService", () => {
  describe("listOrders", () => {
    it("projects every order's status, backorder flag, and line count", async () => {
      const service = await freshService();
      const list = await service.listOrders();

      const notStarted = list.find((o) => o.orderCode === "QT-000781")!;
      expect(notStarted.fulfillmentStatus).toBeNull();
      expect(notStarted.hasOpenBackorder).toBe(false);
      expect(notStarted.lineCount).toBe(1);

      const splitProposed = list.find((o) => o.orderCode === "QT-000782")!;
      expect(splitProposed.fulfillmentStatus).toBe("SPLIT_PROPOSED");
      expect(splitProposed.hasOpenBackorder).toBe(false);

      const backordered = list.find((o) => o.orderCode === "QT-000783")!;
      expect(backordered.fulfillmentStatus).toBe("PARTIALLY_ALLOCATED");
      expect(backordered.hasOpenBackorder).toBe(true);
      expect(backordered.lineCount).toBe(2);

      const shipped = list.find((o) => o.orderCode === "QT-000770")!;
      expect(shipped.fulfillmentStatus).toBe("SHIPPED");

      const completed = list.find((o) => o.orderCode === "QT-000750")!;
      expect(completed.orderStatus).toBe("COMPLETED");
    });
  });

  describe("getOrder", () => {
    it("returns full detail including billing and timeline for a shipped/invoiced order", async () => {
      const service = await freshService();
      const order = await service.getOrder("ord-7790");

      expect(order.fulfillmentStatus).toBe("SHIPPED");
      expect(order.billing).toMatchObject({ invoiceCode: "INV-2201", status: "ISSUED" });
      expect(order.timeline.length).toBeGreaterThanOrEqual(3);
      expect(order.timeline.map((t) => t.action)).toContain("Invoice issued");
    });

    it("returns backorder detail with restock ETA for a partially-allocated order", async () => {
      const service = await freshService();
      const order = await service.getOrder("ord-7822");

      expect(order.backorders).toHaveLength(1);
      expect(order.backorders[0]).toMatchObject({ status: "OPEN", remainingQty: 4 });
      expect(order.lines.some((l) => l.lineStatus === "BACKORDERED")).toBe(true);
      expect(order.lines.some((l) => l.lineStatus === "ALLOCATED")).toBe(true);
    });

    it("rejects an unknown order id", async () => {
      const service = await freshService();
      await expect(service.getOrder("does-not-exist")).rejects.toBeInstanceOf(
        MockFulfillmentServiceError,
      );
    });
  });

  describe("acceptSuggestedSplit", () => {
    it("allocates every line, clears the suggestion, and logs a timeline entry", async () => {
      const service = await freshService();
      const before = await service.getOrder("ord-7818");
      expect(before.fulfillmentStatus).toBe("SPLIT_PROPOSED");

      const after = await service.acceptSuggestedSplit("ord-7818");

      expect(after.fulfillmentStatus).toBe("ALLOCATED");
      expect(after.suggestedSplit).toHaveLength(0);
      expect(after.lines.every((l) => l.lineStatus === "ALLOCATED")).toBe(true);
      expect(after.lines.every((l) => l.allocatedQty === l.orderedQty)).toBe(true);
      expect(after.timeline.at(-1)).toMatchObject({ action: "Split accepted" });
    });

    it("rejects accepting a split on an order that has none proposed", async () => {
      const service = await freshService();
      await expect(service.acceptSuggestedSplit("ord-7801")).rejects.toBeInstanceOf(
        MockFulfillmentServiceError,
      );
    });
  });

  describe("overrideSplit", () => {
    it("rejects quantities that don't sum to the full ordered amount", async () => {
      const service = await freshService();
      await expect(
        service.overrideSplit("ord-7818", { splits: [{ warehouseId: "wh-austin", quantity: 1 }] }),
      ).rejects.toBeInstanceOf(MockFulfillmentServiceError);
    });

    it("applies a valid override and logs a timeline entry", async () => {
      const service = await freshService();
      const order = await service.getOrder("ord-7818");
      const totalOrdered = order.lines.reduce((sum, l) => sum + l.orderedQty, 0);

      const after = await service.overrideSplit("ord-7818", {
        splits: [
          { warehouseId: "wh-austin", quantity: totalOrdered },
          { warehouseId: "wh-chicago", quantity: 0 },
        ],
      });

      expect(after.fulfillmentStatus).toBe("ALLOCATED");
      expect(after.suggestedSplit).toHaveLength(0);
      expect(after.timeline.at(-1)).toMatchObject({ action: "Manual override applied" });
    });

    it("rejects overriding an order that isn't awaiting a split decision", async () => {
      const service = await freshService();
      await expect(
        service.overrideSplit("ord-7822", { splits: [{ warehouseId: "wh-newark", quantity: 10 }] }),
      ).rejects.toBeInstanceOf(MockFulfillmentServiceError);
    });
  });
});
