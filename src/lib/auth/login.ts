import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import { hashPassword, verifyPassword } from "./password";
import { createSession } from "./session";

export type LoginResult = {
  user: { id: string; email: string; role: string; customerId: string | null };
  token: string;
  expiresAt: Date;
};

/**
 * Email/password login with self-service CUSTOMER provisioning: a known email verifies its
 * stored password; an unrecognized email creates a brand-new CUSTOMER account on the spot. This
 * is the ONLY account-creation path that doesn't go through admin tooling (src/modules/users),
 * and it can never produce anything other than CUSTOMER — ADMIN/SALES_REP/MANAGER/FINANCE_OPS
 * accounts only ever come from an admin explicitly creating them (POST /api/users).
 */
export async function loginOrProvision(email: string, password: string): Promise<LoginResult> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, customerId: true, passwordHash: true, isActive: true },
  });

  const user = existing
    ? await authenticateExisting(existing, password)
    : await provisionCustomer(email, password);

  const session = await createSession(user.id);
  return { user, token: session.token, expiresAt: session.expiresAt };
}

async function authenticateExisting(
  existing: { id: string; email: string; role: string; customerId: string | null; passwordHash: string; isActive: boolean },
  password: string,
) {
  if (!existing.isActive) {
    throw new ServiceError("AUTHENTICATION_REQUIRED", "Invalid email or password");
  }
  const valid = await verifyPassword(password, existing.passwordHash);
  if (!valid) {
    throw new ServiceError("AUTHENTICATION_REQUIRED", "Invalid email or password");
  }
  return { id: existing.id, email: existing.email, role: existing.role, customerId: existing.customerId };
}

async function provisionCustomer(email: string, password: string) {
  const tier =
    (await prisma.customerTier.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await prisma.customerTier.create({ data: { name: "Bronze" } }));

  const passwordHash = await hashPassword(password);
  const localPart = email.split("@")[0] ?? email;

  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { name: localPart, tierId: tier.id, primaryContactEmail: email },
    });
    return tx.user.create({
      data: { email, passwordHash, role: "CUSTOMER", customerId: customer.id },
      select: { id: true, email: true, role: true, customerId: true },
    });
  });

  return created;
}
