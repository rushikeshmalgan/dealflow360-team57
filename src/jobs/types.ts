import type { Job } from "bullmq";

/**
 * Every BullMQ job payload is `{ outboxId }` only (TAD SS24A) - never the outbox's own
 * payload, a business object, or a secret. The worker reloads the authoritative row from
 * PostgreSQL before doing anything, so Redis never holds more than a pointer.
 */
export type OutboxJobData = { outboxId: string };

export type JobProcessor = (job: Job<OutboxJobData>) => Promise<void>;
