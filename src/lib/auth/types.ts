import type { AppRole } from "./roles";

/**
 * Represents the authenticated user's identity as resolved from Clerk.
 *
 * All fields come from trusted server-side sources (Clerk auth() + publicMetadata).
 * The client NEVER provides these values.
 */
export interface AuthenticatedUser {
  /** Clerk's unique user ID (maps to users.clerk_user_id in PostgreSQL). */
  clerkUserId: string;

  /** The user's role from Clerk publicMetadata.role. */
  role: AppRole;

  /** The user's email address from Clerk. */
  email: string;

  /** The user's first name from Clerk (may be null). */
  firstName: string | null;

  /** The user's last name from Clerk (may be null). */
  lastName: string | null;
}
