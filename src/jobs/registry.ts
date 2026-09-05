import type { QueueName } from "@/jobs/queues";
import { maintenanceProcessors } from "@/jobs/processors/maintenance";
import type { JobProcessor } from "@/jobs/types";

/** eventType is namespaced "<domain>.<action>"; the domain prefix picks the BullMQ queue. */
const DOMAIN_TO_QUEUE: Record<string, QueueName> = {
  notification: "notifications",
  export: "exports",
  conversion: "conversions",
  maintenance: "maintenance",
};

/**
 * Resolves an outbox eventType to its BullMQ queue. Throws for an unrecognized domain so the
 * dispatcher can mark that row FAILED immediately instead of retrying an event type that will
 * never route anywhere.
 */
export function resolveQueueName(eventType: string): QueueName {
  const domain = eventType.split(".")[0];
  const queueName = domain ? DOMAIN_TO_QUEUE[domain] : undefined;
  if (!queueName) {
    throw new Error(`No queue configured for event type "${eventType}"`);
  }
  return queueName;
}

/**
 * Job name (== outbox eventType) -> processor. Only "maintenance.*" is wired up by this
 * feature; notifications/exports/conversions are reserved for future features (email, report
 * export, file conversion) per DealFlow360_docs TAD SS24A.
 */
export const JOB_PROCESSORS: Record<string, JobProcessor> = {
  ...maintenanceProcessors,
};

/** Queues the worker process should actually listen on - only ones with a registered processor. */
export function queuesWithProcessors(): QueueName[] {
  const names = new Set<QueueName>();
  for (const eventType of Object.keys(JOB_PROCESSORS)) {
    names.add(resolveQueueName(eventType));
  }
  return [...names];
}
