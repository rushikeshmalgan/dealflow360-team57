/**
 * DealFlow360 application roles.
 *
 * These match the Prisma Role enum defined in prisma/schema.prisma.
 * Roles are stored in Clerk publicMetadata.role and are ONLY settable
 * through trusted server/admin tooling — never from client input.
 */

/** The five application roles per TAD §6 and Prisma Role enum. */
export const APP_ROLES = [
  "ADMIN",
  "SALES_REP",
  "MANAGER",
  "FINANCE_OPS",
  "CUSTOMER",
] as const;

/** Union type of valid application roles. */
export type AppRole = (typeof APP_ROLES)[number];

/**
 * Type guard: returns true if the given value is a valid AppRole.
 * Used to validate roles coming from Clerk publicMetadata before
 * trusting them for authorization decisions.
 */
export function isValidRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" &&
    APP_ROLES.includes(value as AppRole)
  );
}
