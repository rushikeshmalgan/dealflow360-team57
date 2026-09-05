import type { Prisma } from "@/generated/prisma/client";

/**
 * Minimal shape every Prisma transaction client (and PrismaClient itself) satisfies. Kept
 * narrow, matching lib/audit.ts's AuditWriter, so repositories can call this from inside
 * `db.$transaction(async (tx) => ...)`.
 */
type OutboxWriter = {
  notificationOutbox: {
    upsert: (args: {
      where: { idempotencyKey: string };
      create: Prisma.NotificationOutboxUncheckedCreateInput;
      update: Prisma.NotificationOutboxUncheckedUpdateInput;
    }) => Promise<{ id: string }>;
  };
};

export type EnqueueOutboxEventParams = {
  eventType: string;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
};

/**
 * Writes one durable dispatch-intent row inside the caller's own business transaction (TAD
 * SS24A/SS26). Upserting by idempotencyKey means calling this twice for the same business event
 * (e.g. a retried request) is a no-op on the second call, not a duplicate outbox row - callers
 * don't need their own existence check. The outbox dispatcher (see dispatcher.ts) picks up
 * PENDING rows independently and after this transaction has already committed.
 */
export async function enqueueOutboxEvent(tx: OutboxWriter, params: EnqueueOutboxEventParams) {
  return tx.notificationOutbox.upsert({
    where: { idempotencyKey: params.idempotencyKey },
    create: {
      eventType: params.eventType,
      payload: params.payload,
      idempotencyKey: params.idempotencyKey,
    },
    update: {},
  });
}
