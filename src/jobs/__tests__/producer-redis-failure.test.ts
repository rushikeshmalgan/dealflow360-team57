import { Queue } from "bullmq";
import Redis from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

// This mirrors the fail-fast options lib/redis.ts uses for the shared producer connection
// (TAD SS24A/SS45: an outbox dispatch attempt must never hang waiting for Redis). It points at
// an address nothing listens on rather than touching the project's real Redis container, so this
// test doesn't disturb other tests or the dev environment.
describe("BullMQ producer connection when Redis is unreachable", () => {
  let connection: Redis | undefined;
  let queue: Queue | undefined;

  afterEach(async () => {
    await queue?.close();
    await connection?.quit().catch(() => connection?.disconnect());
    connection = undefined;
    queue = undefined;
  });

  it("rejects quickly instead of hanging, so a dispatch pass never blocks on Redis", async () => {
    connection = new Redis("redis://127.0.0.1:1", {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
      connectTimeout: 300,
    });
    connection.on("error", () => {});
    queue = new Queue("test-unreachable-redis", { connection });

    const start = Date.now();
    await expect(queue.add("x", { outboxId: "irrelevant" })).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(5000);
  }, 10_000);
});
