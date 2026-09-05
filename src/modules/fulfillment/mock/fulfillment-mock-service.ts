/**
 * TEMPORARY MOCK ADAPTER — Order & Fulfillment (Stage 1: UI only).
 *
 * No backend exists yet for this feature. This in-memory implementation lets Stage 1 build and
 * exercise the full fulfillment UI against the contract Stage 2 must fulfil.
 *
 * DELETE THIS FILE (and fulfillment-mock-data.ts) once a real, Prisma-backed implementation of
 * the `/api/fulfillment/orders/*` routes exists. Nothing in `src/app/fulfillment/**` should need
 * to change beyond swapping which implementation `getFulfillmentService()` returns.
 */
import type {
  FulfillmentOrderDetailDto,
  FulfillmentOrderListItemDto,
  OverrideSplitInput,
} from "@/modules/fulfillment/application/types";
import { MOCK_ORDERS } from "@/modules/fulfillment/mock/fulfillment-mock-data";

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MockFulfillmentServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockFulfillmentServiceError";
  }
}

export interface FulfillmentService {
  listOrders(): Promise<FulfillmentOrderListItemDto[]>;
  getOrder(id: string): Promise<FulfillmentOrderDetailDto>;
  acceptSuggestedSplit(id: string): Promise<FulfillmentOrderDetailDto>;
  overrideSplit(id: string, input: OverrideSplitInput): Promise<FulfillmentOrderDetailDto>;
}

/** Exported (rather than kept private to this file) so tests can construct an isolated instance
 * per test instead of sharing the module-level singleton below. */
export class MockFulfillmentServiceImpl implements FulfillmentService {
  private store: FulfillmentOrderDetailDto[] = clone(MOCK_ORDERS);

  async listOrders(): Promise<FulfillmentOrderListItemDto[]> {
    const items = this.store.map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      customerName: o.customerName,
      orderStatus: o.orderStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      hasOpenBackorder: o.backorders.some((b) => b.status !== "RESOLVED"),
      lineCount: o.lines.length,
      amount: o.orderTotal,
      updatedAt: o.updatedAt,
    }));
    return delay(clone(items));
  }

  async getOrder(id: string): Promise<FulfillmentOrderDetailDto> {
    const found = this.store.find((o) => o.id === id);
    if (!found) throw new MockFulfillmentServiceError("Order not found.");
    return delay(clone(found));
  }

  async acceptSuggestedSplit(id: string): Promise<FulfillmentOrderDetailDto> {
    const order = this.store.find((o) => o.id === id);
    if (!order) throw new MockFulfillmentServiceError("Order not found.");
    if (order.fulfillmentStatus !== "SPLIT_PROPOSED" || order.suggestedSplit.length === 0) {
      throw new MockFulfillmentServiceError("This order has no suggested split to accept.");
    }

    const now = new Date().toISOString();
    order.lines = order.lines.map((line, index) => {
      const split = order.suggestedSplit[index % order.suggestedSplit.length];
      return {
        ...line,
        allocatedQty: line.orderedQty,
        warehouseName: split.warehouseName,
        estShipmentDate: split.estShipmentDate,
        shippingCost: split.cost,
        lineStatus: "ALLOCATED" as const,
      };
    });
    order.fulfillmentStatus = "ALLOCATED";
    order.suggestedSplit = [];
    order.updatedAt = now;
    order.timeline.push({
      id: `t-${order.id}-${order.timeline.length + 1}`,
      actorLabel: "Warehouse/Ops",
      action: "Split accepted",
      detail: "Suggested warehouse split accepted as-is.",
      createdAt: now,
    });

    return delay(clone(order));
  }

  async overrideSplit(id: string, input: OverrideSplitInput): Promise<FulfillmentOrderDetailDto> {
    const order = this.store.find((o) => o.id === id);
    if (!order) throw new MockFulfillmentServiceError("Order not found.");
    if (order.fulfillmentStatus !== "SPLIT_PROPOSED") {
      throw new MockFulfillmentServiceError("This order is not awaiting a warehouse split decision.");
    }
    const totalOrdered = order.lines.reduce((sum, l) => sum + l.orderedQty, 0);
    const totalOverride = input.splits.reduce((sum, s) => sum + s.quantity, 0);
    if (input.splits.length === 0 || totalOverride !== totalOrdered) {
      throw new MockFulfillmentServiceError(
        `Override quantities must add up to the full ordered quantity (${totalOrdered}).`,
      );
    }

    const now = new Date().toISOString();
    order.fulfillmentStatus = "ALLOCATED";
    order.suggestedSplit = [];
    order.updatedAt = now;
    order.timeline.push({
      id: `t-${order.id}-${order.timeline.length + 1}`,
      actorLabel: "Warehouse/Ops",
      action: "Manual override applied",
      detail: `Custom split across ${input.splits.length} warehouse(s).`,
      createdAt: now,
    });

    return delay(clone(order));
  }
}

let instance: FulfillmentService | null = null;

/** Single entry point the UI uses to reach the fulfillment backend — swap the implementation here in Stage 2. */
export function getFulfillmentService(): FulfillmentService {
  if (!instance) instance = new MockFulfillmentServiceImpl();
  return instance;
}
