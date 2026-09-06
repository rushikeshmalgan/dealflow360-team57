import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/shared/domain/actor";

import { getSessionUser, SESSION_COOKIE_NAME } from "./session";

/**
 * Looks up an already-seeded `users` row by its internal id, active-only. Shared by the REST
 * `x-dev-user-id` bypass below and the Socket.IO handshake's equivalent dev bypass
 * (src/realtime/authentication.ts) - both let local tooling impersonate a seeded row without a
 * real browser session, and both only ever trust role/customerId from this Postgres row.
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
 * Maps a request to this app's internal Actor `{id, role, customerId}` — the shape every
 * service's requireInternal/requireAdmin/requireRole check consumes (see request-actor.ts).
 * Two paths:
 *
 * 1. Real session: read the `df_session` cookie, resolve it against the `sessions` table
 *    (src/lib/auth/session.ts) — role/customerId always come from the joined `users` row, never
 *    trusted from the cookie itself beyond the opaque token it carries.
 * 2. Local API-testing bypass (`x-dev-user-id` header, non-production only): impersonate an
 *    already-seeded `users` row directly by its internal id, so tools like Postman can exercise
 *    the API without a browser session. The header only ever selects *which* row to trust —
 *    role/customerId still come from that row in Postgres, so a caller cannot grant themselves a
 *    role the seeded user doesn't actually have.
 */
export async function resolveRequestActor(request: NextRequest): Promise<Actor | null> {
  if (process.env.NODE_ENV !== "production") {
    const devUserId = request.headers.get("x-dev-user-id");
    if (devUserId) return resolveActorByInternalUserId(devUserId);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await getSessionUser(token);
  if (!user) return null;

  return { id: user.id, role: user.role, customerId: user.customerId };
}
