import { auth, currentUser } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { isValidRole } from "@/lib/auth/roles";
import type { Actor } from "@/modules/shared/domain/actor";

import { resolveRequestActor } from "./auth/resolve-actor";

export type RequestActorResolver = (request: NextRequest) => Promise<Actor | null>;

<<<<<<< HEAD
// Defaults to the real Clerk-backed resolver (src/lib/auth/resolve-actor.ts). Kept overridable
// (rather than calling resolveRequestActor directly from every route) so tests — or a future
// identity source — can swap it out without touching every Route Handler.
let resolver: RequestActorResolver = resolveRequestActor;

export function registerRequestActorResolver(nextResolver: RequestActorResolver) {
  resolver = nextResolver;
}

export async function getRequestActor(request: NextRequest) {
  return resolver(request);
=======
export async function getRequestActor(request: NextRequest): Promise<Actor | null> {
  void request;
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, role: true, customerId: true, isActive: true },
  });

  const user =
    existingUser ??
    (await (async () => {
      const clerkUser = await currentUser();
      const role = clerkUser?.publicMetadata?.role;
      if (!clerkUser || !isValidRole(role)) return null;

      return prisma.user.create({
        data: {
          clerkUserId,
          email: clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUser.id}@clerk.local`,
          role,
        },
        select: { id: true, role: true, customerId: true, isActive: true },
      });
    })());

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    role: user.role,
    customerId: user.customerId,
  };
>>>>>>> f65f9fc423dec4447565cf0aaf5626ae20ae24f1
}
