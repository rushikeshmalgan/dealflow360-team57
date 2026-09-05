import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/shared/domain/actor";

import { QuotationService } from "../quotation-service";
import type { QuotationRepository } from "../ports";
import type { QuotationDto } from "../types";

const admin: Actor = { id: "actor-admin", role: "ADMIN" };
const manager: Actor = { id: "actor-manager", role: "MANAGER" };
const rep: Actor = { id: "rep-1", role: "SALES_REP" };
const otherRep: Actor = { id: "rep-2", role: "SALES_REP" };
const customer: Actor = { id: "actor-cust", role: "CUSTOMER", customerId: "cust-1" };

function makeQuotation(overrides: Partial<QuotationDto> = {}): QuotationDto {
  return {
    id: "quote-1",
    code: "QT-000001",
    seqNo: 1,
    customer: { id: "cust-1", name: "Acme", tierId: "tier-1" },
    salesRep: { id: rep.id, email: "rep@test.local" },
    priceList: { id: "pl-1", name: "Gold USD", currency: "USD" },
    status: "DRAFT",
    orderDiscountPct: "0",
    version: 1,
    lines: [],
    summary: { netBeforeTax: "0.00", totalCost: "0.00", marginAmount: "0.00", marginPct: null },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRepository(overrides: Partial<QuotationRepository> = {}): QuotationRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(makeQuotation()),
    create: vi.fn().mockResolvedValue(makeQuotation()),
    addLine: vi.fn().mockResolvedValue(makeQuotation()),
    patch: vi.fn().mockResolvedValue(makeQuotation()),
    updateDiscounts: vi.fn().mockResolvedValue(makeQuotation()),
    submit: vi.fn().mockResolvedValue(makeQuotation()),
    ...overrides,
  };
}

describe("QuotationService authorization", () => {
  it("denies list/get to an unauthenticated actor", async () => {
    const service = new QuotationService(makeRepository());
    await expect(service.list(null)).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(service.get(null, "quote-1")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("denies a CUSTOMER actor from reading the internal quotation workspace", async () => {
    const service = new QuotationService(makeRepository());
    await expect(service.list(customer)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("scopes a Sales Rep's list to their own quotations regardless of a requested salesRepId", async () => {
    const repository = makeRepository();
    const service = new QuotationService(repository);
    await service.list(rep, { salesRepId: otherRep.id });
    expect(repository.list).toHaveBeenCalledWith({ salesRepId: rep.id });
  });

  it("does not override salesRepId for a Manager", async () => {
    const repository = makeRepository();
    const service = new QuotationService(repository);
    await service.list(manager, { salesRepId: rep.id });
    expect(repository.list).toHaveBeenCalledWith({ salesRepId: rep.id });
  });

  it("denies a Sales Rep from reading another rep's quotation", async () => {
    const repository = makeRepository({
      get: vi
        .fn()
        .mockResolvedValue(makeQuotation({ salesRep: { id: rep.id, email: "r@test.local" } })),
    });
    const service = new QuotationService(repository);
    await expect(service.get(otherRep, "quote-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a Manager to read any quotation", async () => {
    const service = new QuotationService(makeRepository());
    await expect(service.get(manager, "quote-1")).resolves.toMatchObject({ id: "quote-1" });
  });

  it("denies quotation creation to non-Sales-Rep roles", () => {
    const service = new QuotationService(makeRepository());
    expect(() => service.create(admin, { customerId: "cust-1", priceListId: "pl-1" })).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => service.create(manager, { customerId: "cust-1", priceListId: "pl-1" })).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("allows a Sales Rep to create a quotation", async () => {
    const repository = makeRepository();
    const service = new QuotationService(repository);
    await service.create(rep, { customerId: "cust-1", priceListId: "pl-1" });
    expect(repository.create).toHaveBeenCalledWith(
      { customerId: "cust-1", priceListId: "pl-1" },
      rep,
    );
  });
});

describe("QuotationService builder mutations", () => {
  it("denies a Sales Rep from mutating another rep's quotation", async () => {
    const repository = makeRepository();
    const service = new QuotationService(repository);
    await expect(
      service.addLine(otherRep, "quote-1", {
        expectedVersion: 1,
        productId: "p-1",
        quantity: 1,
        billingType: "ONE_TIME",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.addLine).not.toHaveBeenCalled();
  });

  it("rejects mutations once the quotation is no longer a Draft", async () => {
    const repository = makeRepository({
      get: vi.fn().mockResolvedValue(makeQuotation({ status: "SUBMITTED" })),
    });
    const service = new QuotationService(repository);
    await expect(
      service.addLine(rep, "quote-1", {
        expectedVersion: 1,
        productId: "p-1",
        quantity: 1,
        billingType: "ONE_TIME",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("allows the owning Sales Rep to add a line to their Draft quotation", async () => {
    const repository = makeRepository();
    const service = new QuotationService(repository);
    const input = {
      expectedVersion: 1,
      productId: "p-1",
      quantity: 2,
      billingType: "ONE_TIME" as const,
    };
    await service.addLine(rep, "quote-1", input);
    expect(repository.addLine).toHaveBeenCalledWith("quote-1", input, rep);
  });

  it("allows the owning Sales Rep to update discounts on their Draft quotation", async () => {
    const repository = makeRepository();
    const service = new QuotationService(repository);
    const input = { expectedVersion: 1, orderDiscountPct: 5 };
    await service.updateDiscounts(rep, "quote-1", input);
    expect(repository.updateDiscounts).toHaveBeenCalledWith("quote-1", input, rep);
  });
});
