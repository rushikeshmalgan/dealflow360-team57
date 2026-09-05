import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/shared/domain/actor";

import { FulfillmentService } from "../fulfillment-service";
import type { FulfillmentRepository } from "../ports";
import type { FulfillmentOrderDetailDto } from "@/modules/fulfillment/application/types";

const admin: Actor = { id: "u-admin", role: "ADMIN" };
const rep: Actor = { id: "u-rep", role: "SALES_REP" };
const customer: Actor = { id: "u-cust", role: "CUSTOMER", customerId: "cust-1" };

function makeOrder(overrides: Partial<FulfillmentOrderDetailDto> = {}): FulfillmentOrderDetailDto {
  return {
    id: "order-1",
    orderCode: "QT-000001",
    customerName: "Acme",
    orderStatus: "CONFIRMED",
    fulfillmentStatus: null,
    orderTotal: "100.00",
    lines: [],
    suggestedSplit: [],
    backorders: [],
    billing: null,
    timeline: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRepository(overrides: Partial<FulfillmentRepository> = {}): FulfillmentRepository {
  return {
    listOrders: vi.fn().mockResolvedValue([]),
    getOrder: vi.fn().mockResolvedValue(makeOrder()),
    acceptSuggestedSplit: vi.fn().mockResolvedValue(makeOrder()),
    overrideSplit: vi.fn().mockResolvedValue(makeOrder()),
    markShipped: vi.fn().mockResolvedValue(makeOrder()),
    ...overrides,
  };
}

describe("FulfillmentService authorization", () => {
  it("denies every method to an unauthenticated actor", async () => {
    const service = new FulfillmentService(makeRepository());
    // list/acceptSuggestedSplit/overrideSplit/markShipped call requireInternal synchronously
    // (same shape as QuotationService.create) — the authorization failure throws before a
    // promise is ever returned, so it's asserted with toThrow, not .rejects.
    expect(() => service.list(null)).toThrow(expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }));
    await expect(service.get(null, "order-1")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
    expect(() => service.acceptSuggestedSplit(null, "order-1")).toThrow(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }),
    );
    expect(() => service.overrideSplit(null, "order-1", { splits: [] })).toThrow(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }),
    );
    expect(() => service.markShipped(null, "order-1")).toThrow(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }),
    );
  });

  it("denies a CUSTOMER actor from viewing or acting on fulfillment — this is an internal-only screen", async () => {
    const service = new FulfillmentService(makeRepository());
    expect(() => service.list(customer)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    await expect(service.get(customer, "order-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(() => service.acceptSuggestedSplit(customer, "order-1")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => service.overrideSplit(customer, "order-1", { splits: [] })).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => service.markShipped(customer, "order-1")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("allows any internal role (not just admin) to view and act — no dedicated ops role exists", async () => {
    const repository = makeRepository();
    const service = new FulfillmentService(repository);

    await service.list(rep);
    await service.get(rep, "order-1");
    await service.acceptSuggestedSplit(admin, "order-1");
    await service.overrideSplit(admin, "order-1", { splits: [] });
    await service.markShipped(rep, "order-1");

    expect(repository.listOrders).toHaveBeenCalled();
    expect(repository.getOrder).toHaveBeenCalledWith("order-1");
    expect(repository.acceptSuggestedSplit).toHaveBeenCalledWith("order-1", admin);
    expect(repository.overrideSplit).toHaveBeenCalledWith("order-1", { splits: [] }, admin);
    expect(repository.markShipped).toHaveBeenCalledWith("order-1", rep);
  });

  it("surfaces NOT_FOUND when the repository returns null for get", async () => {
    const repository = makeRepository({ getOrder: vi.fn().mockResolvedValue(null) });
    const service = new FulfillmentService(repository);
    await expect(service.get(rep, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
