import { auth, currentUser } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { isValidRole } from "@/lib/auth/roles";
import type { Actor } from "@/modules/shared/domain/actor";

export type RequestActorResolver = (request: NextRequest) => Promise<Actor | null>;

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
}
