import { describe, expect, it } from "vitest";

import { authorizeRoomJoin, type QuotationAccessPort } from "@/realtime/authorization";
import type { ParsedRoom } from "@/realtime/rooms";
import type { Actor } from "@/modules/shared/domain/actor";

const fakeQuotationAccess = (salesRepId: string | null): QuotationAccessPort => ({
  getSalesRepId: async () => salesRepId,
});

const room = (kind: ParsedRoom["kind"], id: string): ParsedRoom => ({ kind, id });

describe("authorizeRoomJoin", () => {
  describe("user:{id}", () => {
    it("allows a user to join their own room", async () => {
      const actor: Actor = { id: "u1", role: "SALES_REP" };
      expect(await authorizeRoomJoin(actor, room("user", "u1"))).toBe(true);
    });

    it("denies joining someone else's user room", async () => {
      const actor: Actor = { id: "u1", role: "SALES_REP" };
      expect(await authorizeRoomJoin(actor, room("user", "u2"))).toBe(false);
    });
  });

  describe("role:{role}", () => {
    it("allows an internal actor to join their own role room", async () => {
      const actor: Actor = { id: "u1", role: "MANAGER" };
      expect(await authorizeRoomJoin(actor, room("role", "MANAGER"))).toBe(true);
    });

    it("denies joining a different role's room", async () => {
      const actor: Actor = { id: "u1", role: "MANAGER" };
      expect(await authorizeRoomJoin(actor, room("role", "FINANCE_OPS"))).toBe(false);
    });

    it("denies a CUSTOMER actor even for role:CUSTOMER", async () => {
      const actor: Actor = { id: "u1", role: "CUSTOMER", customerId: "c1" };
      expect(await authorizeRoomJoin(actor, room("role", "CUSTOMER"))).toBe(false);
    });

    it("denies an invalid role name", async () => {
      const actor: Actor = { id: "u1", role: "MANAGER" };
      expect(await authorizeRoomJoin(actor, room("role", "NOT_A_ROLE"))).toBe(false);
    });
  });

  describe("quotation:{id}", () => {
    it("denies a CUSTOMER actor outright (mirrors QuotationService.get())", async () => {
      const actor: Actor = { id: "u1", role: "CUSTOMER", customerId: "c1" };
      const deps = { quotationAccess: fakeQuotationAccess("rep-1") };
      expect(await authorizeRoomJoin(actor, room("quotation", "q1"), deps)).toBe(false);
    });

    it("denies when the quotation doesn't exist", async () => {
      const actor: Actor = { id: "u1", role: "MANAGER" };
      const deps = { quotationAccess: fakeQuotationAccess(null) };
      expect(await authorizeRoomJoin(actor, room("quotation", "missing"), deps)).toBe(false);
    });

    it("allows the owning Sales Rep", async () => {
      const actor: Actor = { id: "rep-1", role: "SALES_REP" };
      const deps = { quotationAccess: fakeQuotationAccess("rep-1") };
      expect(await authorizeRoomJoin(actor, room("quotation", "q1"), deps)).toBe(true);
    });

    it("denies a Sales Rep who doesn't own the quotation", async () => {
      const actor: Actor = { id: "rep-2", role: "SALES_REP" };
      const deps = { quotationAccess: fakeQuotationAccess("rep-1") };
      expect(await authorizeRoomJoin(actor, room("quotation", "q1"), deps)).toBe(false);
    });

    it("allows Manager/Finance/Admin regardless of ownership", async () => {
      const deps = { quotationAccess: fakeQuotationAccess("rep-1") };
      for (const role of ["MANAGER", "FINANCE_OPS", "ADMIN"] as const) {
        expect(await authorizeRoomJoin({ id: "someone-else", role }, room("quotation", "q1"), deps)).toBe(true);
      }
    });
  });

  describe("customer:{id}", () => {
    it("allows a customer actor to join their own customer room", async () => {
      const actor: Actor = { id: "u1", role: "CUSTOMER", customerId: "c1" };
      expect(await authorizeRoomJoin(actor, room("customer", "c1"))).toBe(true);
    });

    it("denies a customer actor joining a different customer's room", async () => {
      const actor: Actor = { id: "u1", role: "CUSTOMER", customerId: "c1" };
      expect(await authorizeRoomJoin(actor, room("customer", "c2"))).toBe(false);
    });

    it("allows internal roles to join any customer room", async () => {
      const actor: Actor = { id: "u1", role: "SALES_REP" };
      expect(await authorizeRoomJoin(actor, room("customer", "c1"))).toBe(true);
    });
  });

  describe("warehouse:{id}", () => {
    it("allows internal roles", async () => {
      const actor: Actor = { id: "u1", role: "FINANCE_OPS" };
      expect(await authorizeRoomJoin(actor, room("warehouse", "w1"))).toBe(true);
    });

    it("denies a customer actor", async () => {
      const actor: Actor = { id: "u1", role: "CUSTOMER", customerId: "c1" };
      expect(await authorizeRoomJoin(actor, room("warehouse", "w1"))).toBe(false);
    });
  });

  describe("document:{id}", () => {
    it("denies everyone - no Document model exists yet", async () => {
      expect(await authorizeRoomJoin({ id: "u1", role: "ADMIN" }, room("document", "d1"))).toBe(false);
      expect(await authorizeRoomJoin({ id: "u1", role: "CUSTOMER", customerId: "c1" }, room("document", "d1"))).toBe(
        false,
      );
    });
  });
});
