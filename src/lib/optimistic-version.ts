import { ServiceError } from "@/lib/service-error";

/**
 * The narrow shape every versioned Prisma model delegate satisfies (Quotation, ApprovalRecord,
 * Subscription, WarehouseStock, Fulfillment, Invoice all carry an integer `version` column per
 * TAD SS26). Typed structurally so this helper has no dependency on generated Prisma model types.
 */
type VersionedDelegate = {
  updateMany: (args: {
    where: { id: string; version: number };
    data: Record<string, unknown>;
  }) => Promise<{ count: number }>;
  findUnique: (args: {
    where: { id: string };
    select: { version: true };
  }) => Promise<{ version: number } | null>;
};

/**
 * T0.4's generic conditional-update-or-409 helper (TAD SS26). Call inside the same
 * `db.$transaction` as the rest of the mutation, passing the transactional delegate
 * (e.g. `tx.quotation`) so the version check and the write commit atomically.
 *
 * Every aggregate mutation across every epic must go through this — no module hand-rolls
 * its own `WHERE id = ? AND version = ?` check.
 */
export async function withOptimisticVersion(
  delegate: VersionedDelegate,
  id: string,
  expectedVersion: number,
  data: Record<string, unknown>,
): Promise<void> {
  const result = await delegate.updateMany({
    where: { id, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count > 0) return;

  const current = await delegate.findUnique({ where: { id }, select: { version: true } });
  if (!current) {
    throw new ServiceError("NOT_FOUND", "Resource not found", { id });
  }
  throw new ServiceError(
    "VERSION_CONFLICT",
    "This resource has been modified since it was last read",
    {
      id,
      expectedVersion,
      currentVersion: current.version,
    },
  );
}
