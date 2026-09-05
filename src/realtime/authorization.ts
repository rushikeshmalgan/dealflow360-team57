import { prisma } from "@/lib/db";
import { isValidRole } from "@/lib/auth/roles";
import type { Actor } from "@/modules/shared/domain/actor";

import type { ParsedRoom } from "./rooms";

export interface QuotationAccessPort {
  /** Resolves a quotation's owning sales rep, or null if the quotation doesn't exist. */
  getSalesRepId(quotationId: string): Promise<string | null>;
}

export const prismaQuotationAccessPort: QuotationAccessPort = {
  async getSalesRepId(quotationId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      select: { salesRepId: true },
    });
    return quotation?.salesRepId ?? null;
  },
};

export type AuthorizeRoomJoinDeps = { quotationAccess: QuotationAccessPort };

const defaultDeps: AuthorizeRoomJoinDeps = { quotationAccess: prismaQuotationAccessPort };

/**
 * Server-side room-join policy (TAD SS6/SS23). The id inside a room name is always
 * client-supplied ("which resource to join"), but access to it is always decided from the
 * server-resolved actor (Clerk-verified identity/role/customerId) - never from the room string
 * or anything else the client asserts. Each case mirrors that resource's existing REST read
 * policy exactly, except `customer` (documented below), so realtime access never becomes
 * looser *or* stricter than what a client could already learn by calling the REST API.
 */
export async function authorizeRoomJoin(
  actor: Actor,
  room: ParsedRoom,
  deps: AuthorizeRoomJoinDeps = defaultDeps,
): Promise<boolean> {
  switch (room.kind) {
    case "user":
      return actor.id === room.id;

    case "role":
      // Broadcast-by-role rooms are for internal staff only - the TAD SS6 role matrix has no
      // "all customers" capability, so a CUSTOMER actor never gets a role room, even its own.
      return actor.role !== "CUSTOMER" && isValidRole(room.id) && actor.role === room.id;

    case "quotation": {
      // Mirrors QuotationService.get()'s read policy exactly
      // (src/modules/quotation/application/quotation-service.ts): internal only, and a Sales
      // Rep is further restricted to quotations they own.
      if (actor.role === "CUSTOMER") return false;
      const salesRepId = await deps.quotationAccess.getSalesRepId(room.id);
      if (salesRepId === null) return false;
      if (actor.role === "SALES_REP") return actor.id === salesRepId;
      return true;
    }

    case "customer":
      // Deliberately broader than the admin-only REST /api/customers/{id} endpoint: that route
      // governs editing a Customer configuration record, while this room's purpose is "receive
      // realtime events about my own account" (TAD SS23 lists `customer` among the negotiation
      // event rooms) - a CUSTOMER actor must be able to join their own customer room.
      if (actor.role === "CUSTOMER") return actor.customerId === room.id;
      return true;

    case "warehouse":
      // Mirrors WarehouseService.get(): internal only, no per-warehouse ownership concept.
      return actor.role !== "CUSTOMER";

    case "document":
      // No Document/DocumentPermission model exists yet (prisma/schema.prisma intentionally
      // excludes it - P1/P2 scope). Fail closed rather than guess at an access model that isn't
      // built; revisit once a real document feature lands.
      return false;

    default:
      return false;
  }
}
