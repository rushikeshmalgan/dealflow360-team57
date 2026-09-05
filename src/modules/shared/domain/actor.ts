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
