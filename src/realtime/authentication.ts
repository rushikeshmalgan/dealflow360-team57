import type { IncomingHttpHeaders } from "node:http";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/session";
import { resolveActorByInternalUserId } from "@/lib/auth/resolve-actor";
import type { Actor } from "@/modules/shared/domain/actor";

/**
 * The Socket.IO handshake never runs through Next.js's request/middleware lifecycle (it's a raw
 * HTTP upgrade on the custom server - see server.ts), so the cookie-based `getCurrentUser()`
 * helper (src/lib/auth/server.ts) doesn't work here. The `df_session` cookie is httpOnly, so
 * client JS can never read it to hand it over explicitly — instead we rely on the browser
 * automatically attaching the `Cookie` header to the same-origin handshake request (socket.io's
 * default XHR/WebSocket cookie behavior), and parse the token out of the raw header here.
 *
 * Do NOT trust any client-supplied user id / role / customerId here - only the opaque session
 * token parsed from the handshake's own Cookie header, and role/customerId always come back from
 * the `sessions` -> `users` join in Postgres.
 */
export type SocketAuthenticationInput = {
  auth: unknown;
  headers: IncomingHttpHeaders;
};

export type SocketActorResolver = (input: SocketAuthenticationInput) => Promise<Actor | null>;

function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

async function resolveViaSessionToken(token: string): Promise<Actor | null> {
  const user = await getSessionUser(token);
  if (!user) return null;
  return { id: user.id, role: user.role, customerId: user.customerId };
}

/**
 * Default resolver: verifies the real session cookie forwarded on the handshake, with the same
 * non-production `devUserId` bypass REST offers via `x-dev-user-id` (src/lib/auth/resolve-actor.ts)
 * so local tooling/tests can connect without a browser session. Never active in production.
 */
export const resolveSocketActorDefault: SocketActorResolver = async ({ auth, headers }) => {
  const authPayload = typeof auth === "object" && auth !== null ? (auth as Record<string, unknown>) : {};

  if (process.env.NODE_ENV !== "production" && typeof authPayload.devUserId === "string") {
    return resolveActorByInternalUserId(authPayload.devUserId);
  }

  const token = extractSessionToken(headers.cookie);
  if (token) return resolveViaSessionToken(token);

  return null;
};

// Overridable like registerRequestActorResolver (src/lib/request-actor.ts) so tests can swap in
// a fake identity resolver instead of a real session/network round trip.
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
