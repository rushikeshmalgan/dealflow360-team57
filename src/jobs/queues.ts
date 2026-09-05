import { Queue } from "bullmq";

import { getProducerConnection } from "./connection";

/**
 * Separate queues per TAD SS24A. Only "maintenance" has a worker/processor wired up by this
 * feature; the others exist so future features (email, report export, file conversion) can
 * start enqueuing into a dedicated queue without touching this infra again.
 */
export const QUEUE_NAMES = ["notifications", "exports", "conversions", "maintenance", "deal-health"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const queues = new Map<QueueName, Queue>();

/**
 * Returns the singleton BullMQ Queue for a name, creating it on first use. Finite attempts +
 * exponential backoff + bounded retention are set here as defaults so every job type gets safe
 * behavior even if a future `queue.add()` call forgets to pass options explicitly.
 */
export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getProducerConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    });
    queues.set(name, queue);
  }
  return queue;
}

/** Closes every queue this process opened. Used by the worker's graceful shutdown and by tests. */
export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
}
