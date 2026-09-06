import { cookies } from "next/headers";

import { getSessionUser, SESSION_COOKIE_NAME } from "./session";
import type { AppRole } from "./roles";
import type { AuthenticatedUser } from "./types";

/**
 * Resolves the currently authenticated user from the `df_session` cookie (Next's request-scoped
 * `cookies()` — server components / Route Handlers only, not the Socket.IO handshake, which uses
 * `resolveSocketActor` in src/realtime/authentication.ts instead).
 *
 * SECURITY: This function NEVER reads identity from request body, query params, or any other
 * client-controlled source — only the httpOnly session cookie, whose token is looked up against
 * the `sessions` table server-side.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const user = await getSessionUser(token);
  if (!user) return null;

  return { id: user.id, role: user.role, email: user.email, customerId: user.customerId };
}

/**
 * Returns the authenticated user or throws an error.
 *
 * Use in server components, route handlers, and server actions where
 * authentication is required.
 *
 * @throws Error if the user is not authenticated.
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
