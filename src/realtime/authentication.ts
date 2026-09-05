import type { IncomingHttpHeaders } from "node:http";

import { createClerkClient, verifyToken } from "@clerk/backend";

import {
  buildAuthenticatedUser,
  resolveActorByInternalUserId,
  resolveActorForClerkUser,
} from "@/lib/auth/clerk-mapping";
import { isValidRole } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/types";
import type { Actor } from "@/modules/shared/domain/actor";

/**
 * The Socket.IO handshake never runs through Next.js's request/middleware lifecycle (it's a raw
 * HTTP upgrade on the custom server - see server.ts), so Clerk's request-scoped `auth()` /
 * `currentUser()` helpers (src/lib/auth/server.ts) don't work here. The client instead sends its
 * Clerk session token via the handshake `auth` payload (Socket.IO's documented credential
 * channel: https://socket.io/docs/v4/middlewares/#sending-credentials), which this module
 * verifies manually with @clerk/backend before resolving the same internal Actor REST uses.
 *
 * Do NOT trust any client-supplied user id / role / customerId here - only `sub` (the Clerk
 * user id) from a cryptographically verified token, and role/customerId always come back from
 * Postgres via resolveActorForClerkUser.
 */
export type SocketAuthenticationInput = {
  auth: unknown;
  headers: IncomingHttpHeaders;
};

export type SocketActorResolver = (input: SocketAuthenticationInput) => Promise<Actor | null>;

// The Socket.IO handshake never runs through Next's request pipeline, so this can't use the
// `@clerk/nextjs/server` convenience client (it needs Next's request-scoped middleware config).
// @clerk/backend's own client, built directly from CLERK_SECRET_KEY, works the same way
// everywhere. It's also the only import path that avoids a real bug in @clerk/nextjs's
// published ESM build: `@clerk/nextjs/server`'s barrel re-exports an internal module via a
// relative import missing a file extension, which plain Node ESM (unlike a bundler) refuses to
// resolve - importing straight from @clerk/backend sidesteps that barrel entirely.
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function resolveViaClerkToken(token: string): Promise<Actor | null> {
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUserId = payload.sub;
    if (!clerkUserId) return null;

    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const role = clerkUser.publicMetadata?.role;
    if (!isValidRole(role)) return null;

    const authenticatedUser: AuthenticatedUser = buildAuthenticatedUser(clerkUserId, role, clerkUser);
    return resolveActorForClerkUser(authenticatedUser);
  } catch (error) {
    console.warn("[realtime] token verification failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Default resolver: verifies a real Clerk session token, with the same non-production
 * `devUserId` bypass REST offers via `x-dev-user-id` (src/lib/auth/resolve-actor.ts) so local
 * tooling/tests can connect without a browser Clerk session. Never active in production.
 */
export const resolveSocketActorDefault: SocketActorResolver = async ({ auth }) => {
  const authPayload = typeof auth === "object" && auth !== null ? (auth as Record<string, unknown>) : {};

  if (process.env.NODE_ENV !== "production" && typeof authPayload.devUserId === "string") {
    return resolveActorByInternalUserId(authPayload.devUserId);
  }

  if (typeof authPayload.token === "string" && authPayload.token.length > 0) {
    return resolveViaClerkToken(authPayload.token);
  }

  return null;
};

// Overridable like registerRequestActorResolver (src/lib/request-actor.ts) so tests can swap in
// a fake identity resolver instead of a real Clerk token/network round trip.
let resolver: SocketActorResolver = resolveSocketActorDefault;

export function registerSocketActorResolver(next: SocketActorResolver): void {
  resolver = next;
}

export function resetSocketActorResolver(): void {
  resolver = resolveSocketActorDefault;
}

export async function resolveSocketActor(input: SocketAuthenticationInput): Promise<Actor | null> {
  return resolver(input);
}
