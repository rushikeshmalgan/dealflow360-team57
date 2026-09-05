import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    // A queued command (e.g. the health check's ping) fails fast rather than
    // hanging, but the client keeps retrying its connection in the background
    // so it self-heals once Redis comes back (TAD SS24A/SS45: an HTTP request
    // must never hang on Redis, and queue degradation is recoverable).
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

// Without a listener, ioredis logs unhandled connection errors to stderr on every
// failed reconnect attempt; callers observe failures through command rejections instead.
redis.on("error", () => {});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
