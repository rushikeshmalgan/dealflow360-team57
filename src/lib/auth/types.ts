import type { AppRole } from "./roles";

/**
 * Represents the authenticated user's identity as resolved from the `df_session` cookie
 * (see src/lib/auth/session.ts). All fields come from the trusted `sessions` -> `users` join —
 * the client never provides these values.
 */
export interface AuthenticatedUser {
  /** Internal `users.id` (uuid). */
  id: string;

  /** The user's role from the `users` table. */
  role: AppRole;

  /** The user's email address. */
  email: string;

  /** The linked `customers.id`, present only for CUSTOMER-role users. */
  customerId: string | null;
}
