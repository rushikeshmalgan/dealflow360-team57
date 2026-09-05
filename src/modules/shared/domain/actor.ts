import { ServiceError } from "@/lib/service-error";

export type Actor = {
  id: string;
  role: "ADMIN" | "SALES_REP" | "MANAGER" | "FINANCE_OPS" | "CUSTOMER";
  customerId?: string | null;
};

export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) {
    throw new ServiceError("AUTHENTICATION_REQUIRED", "Authentication is required");
  }
  if (actor.role !== "ADMIN") {
    throw new ServiceError("FORBIDDEN", "Administrator access is required");
  }
}

export function requireInternal(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) {
    throw new ServiceError("AUTHENTICATION_REQUIRED", "Authentication is required");
  }
  if (actor.role === "CUSTOMER") {
    throw new ServiceError("FORBIDDEN", "Internal access is required");
  }
}

/**
 * TAD SS6 role matrix: only some capabilities are role-specific (e.g. "Create and revise
 * assigned quotations" is Sales Rep only, Manager/Finance get Read). Use this instead of a
 * bespoke `actor.role !== "X"` check so the denial message stays consistent.
 */
export function requireRole(
  actor: Actor | null | undefined,
  roles: readonly Actor["role"][],
): asserts actor is Actor {
  if (!actor) {
    throw new ServiceError("AUTHENTICATION_REQUIRED", "Authentication is required");
  }
  if (!roles.includes(actor.role)) {
    throw new ServiceError("FORBIDDEN", `Requires one of the following roles: ${roles.join(", ")}`);
  }
}

/**
 * TAD SS6: "IDs supplied by the browser or job payload never establish ownership." Every
 * "assigned"-scoped capability (e.g. a Sales Rep's own quotations) must check the actor
 * against the resource's owning ID in code, not trust a route param alone.
 */
export function requireOwnResource(actor: Actor, resourceOwnerId: string): void {
  if (actor.id !== resourceOwnerId) {
    throw new ServiceError("FORBIDDEN", "You do not have access to this resource");
  }
}
