import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/modules/shared/domain/actor";

/**
 * Minimal shape every Prisma transaction client (and PrismaClient itself) satisfies.
 * Kept narrow so repositories can call this from inside `db.$transaction(async (tx) => ...)`.
 */
type AuditWriter = {
  auditLog: {
    create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};

export type RecordAuditParams = {
  actor: Actor | null | undefined;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/**
 * Writes one audit_logs row. Call this inside the same transaction as the business
 * mutation it documents, so the config change and its audit trail commit atomically.
 * TAD SS30 / Feature-ticket-list T0.4 scope this as a single shared writer so no module
 * hand-rolls its own audit insert.
 */
export async function recordAudit(tx: AuditWriter, params: RecordAuditParams) {
  await tx.auditLog.create({
    data: {
      actorUserId: params.actor?.id ?? null,
      actorRole: params.actor?.role ?? null,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      before: (params.before ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      after: (params.after ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      reason: params.reason ?? null,
    },
  });
}
