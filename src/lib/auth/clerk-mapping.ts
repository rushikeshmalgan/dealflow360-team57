import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/shared/domain/actor";

import type { AppRole } from "./roles";
import type { AuthenticatedUser } from "./types";

/**
 * Pure Clerk-identity -> internal-Actor mapping, deliberately free of any `@clerk/nextjs`
 * import. `src/lib/auth/server.ts` (Next request-scoped `auth()`/`currentUser()`) and
 * `src/realtime/authentication.ts` (Socket.IO handshake, `@clerk/backend` token verification)
 * both resolve a Clerk identity differently, but need the exact same mapping afterward - and
 * both must stay loadable without pulling in `@clerk/nextjs/server`'s published ESM build,
 * which has real relative imports missing file extensions (fine for bundlers, but rejected by
 * plain Node ESM - the custom server in server.ts runs via `node --experimental-strip-types`
 * with no bundler, see server.ts's top comment).
 */

/** Structural shape both `currentUser()` and `clerkClient().users.getUser()` satisfy. */
type ClerkUserLike = {
  emailAddresses: { emailAddress: string }[];
  firstName: string | null;
  lastName: string | null;
};

export function buildAuthenticatedUser(
  clerkUserId: string,
  role: AppRole,
  user: ClerkUserLike,
): AuthenticatedUser {
  return {
    clerkUserId,
    role,
    email: user.emailAddresses[0]?.emailAddress ?? "",
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/**
 * Looks up an already-seeded `users` row by its internal id, active-only. Shared by the REST
 * `x-dev-user-id` bypass (src/lib/auth/resolve-actor.ts) and the Socket.IO handshake's
 * equivalent dev bypass (src/realtime/authentication.ts) - both let local tooling impersonate a
 * seeded row without a real Clerk session, and both only ever trust role/customerId from this
 * Postgres row.
 */
export async function resolveActorByInternalUserId(userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, customerId: true, isActive: true },
  });
  if (!user?.isActive) return null;
  return { id: user.id, role: user.role, customerId: user.customerId };
}

/**
 * Mirrors a verified Clerk identity into the internal `users` table and returns its Actor.
 *
 * HACKATHON SHORTCUT (TAD §7 calls for a Clerk webhook or "explicit seed/sync command" to
 * mirror Clerk -> users; neither is wired up yet, so a teammate who signs up through the
 * real Clerk UI would otherwise have no `users` row and every mutation would 401 forever).
 * Auto-provision/refresh the mirror row here instead. This is still safe: role/email always
 * come from an already Clerk-verified identity (never client input), so a caller cannot grant
 * themselves a role — it only ever mirrors what Clerk already asserts. Shared by the REST actor
 * resolver (src/lib/auth/resolve-actor.ts) and the Socket.IO handshake authenticator
 * (src/realtime/authentication.ts), so a Clerk identity maps to the exact same internal user
 * however it was verified. Replace with a real /api/webhooks/clerk (T1.2) before production.
 */
export async function resolveActorForClerkUser(clerkUser: AuthenticatedUser): Promise<Actor | null> {
  const user = await prisma.user.upsert({
    where: { clerkUserId: clerkUser.clerkUserId },
    update: { email: clerkUser.email, role: clerkUser.role },
    create: { clerkUserId: clerkUser.clerkUserId, email: clerkUser.email, role: clerkUser.role },
    select: { id: true, role: true, customerId: true, isActive: true },
  });
  if (!user.isActive) return null;

  return { id: user.id, role: user.role, customerId: user.customerId };
}
