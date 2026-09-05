import { auth, currentUser } from "@clerk/nextjs/server";

import type { AppRole } from "./roles";
import { isValidRole } from "./roles";
import type { AuthenticatedUser } from "./types";

/**
 * Resolves the currently authenticated user from Clerk's server-side auth context.
 *
 * The role is extracted from `publicMetadata.role` — the single trusted source.
 * Returns null if the user is not authenticated or has no valid role.
 *
 * SECURITY: This function NEVER reads role data from request body, query params,
 * cookies, or any client-controlled source. The Clerk session token (managed by
 * Clerk infrastructure) is the sole identity source.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const user = await currentUser();

  if (!user) {
    return null;
  }

  const role = user.publicMetadata?.role;

  if (!isValidRole(role)) {
    return null;
  }

  return {
    clerkUserId: userId,
    role,
    email: user.emailAddresses[0]?.emailAddress ?? "",
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/**
 * Returns the authenticated user or throws an error.
 *
 * Use in server components, route handlers, and server actions where
 * authentication is required.
 *
 * @throws Error if the user is not authenticated or has an invalid role.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  return user;
}

/**
 * Returns the authenticated user if they have one of the specified roles.
 *
 * @param allowedRoles - One or more roles that are permitted.
 * @throws Error with code AUTHENTICATION_REQUIRED if not authenticated.
 * @throws Error with code FORBIDDEN if the user's role is not in allowedRoles.
 */
export async function requireRole(
  ...allowedRoles: AppRole[]
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }

  return user;
}
