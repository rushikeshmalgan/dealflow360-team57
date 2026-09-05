import Redis from "ioredis";

import { redis } from "@/lib/redis";

/**
 * BullMQ producers (Queue.add) never issue blocking Redis commands, so the app's existing
 * fail-fast client (lib/redis.ts - maxRetriesPerRequest: 1, lazyConnect) is reused as-is: an
 * outbox dispatch attempt must never hang waiting for Redis (TAD SS24A/SS45).
 */
export function getProducerConnection() {
  return redis;
}

/**
 * BullMQ Workers block on Redis Streams while waiting for jobs, which requires
 * `maxRetriesPerRequest: null` on the connection - reusing the fail-fast producer client here
 * would throw at Worker construction. This is a separate, dedicated connection per worker
 * process; it is allowed to wait and reconnect indefinitely (TAD SS24A: "Worker connections may
 * wait and reconnect").
 */
export function createWorkerConnection() {
  const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  connection.on("error", (error) => {
    console.error("[worker connection] redis error", error.message);
  });
  return connection;
}
