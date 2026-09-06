import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";

export { SESSION_COOKIE_NAME } from "./session-cookie";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  role: "ADMIN" | "SALES_REP" | "MANAGER" | "FINANCE_OPS" | "CUSTOMER";
  customerId: string | null;
};

/** Creates a new session row and returns the opaque token to set as the `df_session` cookie. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

/**
 * Resolves a session token to its user, active-only. Lazily deletes (and treats as absent) an
 * expired session rather than trusting `expiresAt` alone, so a stale cookie never re-authenticates.
 */
export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, role: true, customerId: true, isActive: true } },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    customerId: session.user.customerId,
  };
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await prisma.session.delete({ where: { token } }).catch(() => {});
}
