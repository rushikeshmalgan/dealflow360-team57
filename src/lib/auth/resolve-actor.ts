import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/shared/domain/actor";

import { getCurrentUser } from "./server";

/**
 * Maps a request to this app's internal Actor `{id, role, customerId}` — the shape every
 * service's requireInternal/requireAdmin/requireRole check consumes (see request-actor.ts,
 * "T1 installs its Clerk-backed resolver here"). Two paths:
 *
 * 1. Real Clerk session: resolve the Clerk identity, then upsert/look up the mirrored `users`
 *    row by clerk_user_id (T1.2 — no webhook exists yet, so this auto-provisions the row on
 *    first sight instead) for the internal id/customerId — role and customerId always come
 *    from Postgres, never trusted from the Clerk token alone (TAD SS6/SS7).
 * 2. Local API-testing bypass (`x-dev-user-id` header, non-production only): impersonate an
 *    already-seeded `users` row directly by its internal id, so tools like Postman can exercise
 *    the API without a browser session/webhook sync. The header only ever selects *which* row
 *    to trust — role/customerId still come from that row in Postgres, so a caller cannot grant
 *    themselves a role the seeded user doesn't actually have.
 */
export async function resolveRequestActor(request: NextRequest): Promise<Actor | null> {
  if (process.env.NODE_ENV !== "production") {
    const devUserId = request.headers.get("x-dev-user-id");
    if (devUserId) {
      const user = await prisma.user.findUnique({
        where: { id: devUserId },
        select: { id: true, role: true, customerId: true, isActive: true },
      });
      if (!user?.isActive) return null;
      return { id: user.id, role: user.role, customerId: user.customerId };
    }
  }

  const clerkUser = await getCurrentUser();
  if (!clerkUser) return null;

  // HACKATHON SHORTCUT (TAD §7 calls for a Clerk webhook or "explicit seed/sync command" to
  // mirror Clerk -> users; neither is wired up yet, so a teammate who signs up through the
  // real Clerk UI would otherwise have no `users` row and every mutation would 401 forever).
  // Auto-provision/refresh the mirror row here instead. This is still safe: role/email come
  // from Clerk's server-verified publicMetadata (getCurrentUser(), never client input), so a
  // caller cannot grant themselves a role — it only ever mirrors what Clerk already asserts.
  // Replace with a real /api/webhooks/clerk (T1.2) before production.
  const user = await prisma.user.upsert({
    where: { clerkUserId: clerkUser.clerkUserId },
    update: { email: clerkUser.email, role: clerkUser.role },
    create: { clerkUserId: clerkUser.clerkUserId, email: clerkUser.email, role: clerkUser.role },
    select: { id: true, role: true, customerId: true, isActive: true },
  });
  if (!user.isActive) return null;

  return { id: user.id, role: user.role, customerId: user.customerId };
}
