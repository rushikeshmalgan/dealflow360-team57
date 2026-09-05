# BullMQ worker infrastructure

Reusable async-job plumbing per `docs/DealFlow360_Technical_Architecture_Document.md` SS24A.
PostgreSQL (the `notification_outbox` table) is the durable source of truth for "this needs to
happen"; Redis only holds BullMQ's queue/job coordination state. No business feature is
implemented here - just the queues, the outbox dispatcher, and the worker process that future
features (email, report export, file conversion, deal-health) plug into.

## Start Redis (and Postgres)

```
docker compose up -d
```

This starts the `postgres` (host port 5433) and `redis` (host port 6380) services declared in
`docker-compose.yml`. `.env` already points at both.

## Start the worker

```
npm run worker
```

Runs `src/jobs/worker.ts` via `tsx`. One process does two things:

- Hosts a BullMQ `Worker` for every queue that has at least one registered job processor
  (currently just `maintenance`).
- Runs the outbox dispatcher on an interval (`DISPATCH_INTERVAL_MS`, default 3000ms).

It logs job lifecycle events (`active`/`completed`/`failed`) and dispatcher batch summaries to
stdout, and shuts down gracefully on `SIGINT`/`SIGTERM`: it stops the dispatcher, waits for
in-flight jobs via `Worker.close()`, then closes its Redis connections.

Env vars (all optional, sensible defaults):

- `WORKER_CONCURRENCY` - concurrent jobs per queue (default 5).
- `DISPATCH_INTERVAL_MS` - how often the dispatcher polls the outbox (default 3000).

Next.js (`npm run dev`) and the worker are separate processes from the same codebase - the app
never runs BullMQ workers in-request.

## How the outbox works

1. A business transaction writes a row to `notification_outbox` via
   `enqueueOutboxEvent(tx, { eventType, payload, idempotencyKey })` (`src/jobs/outbox.ts`),
   inside the same Prisma transaction as the business change. The row starts `PENDING`. Calling
   this twice with the same `idempotencyKey` is a no-op (upsert), so retried requests don't
   double-enqueue.
2. The dispatcher (`src/jobs/dispatcher.ts`, `dispatchOutboxBatch`) claims a batch of due
   `PENDING` rows with `SELECT ... FOR UPDATE SKIP LOCKED`, adds a BullMQ job per row with a
   **deterministic jobId** (a sha256 hash of the row's `idempotencyKey` - BullMQ rejects `:` in
   custom job IDs, which free-form idempotency keys can contain), and only then marks the row
   `DISPATCHED` in the same transaction. Job data is `{ outboxId }` only - never the outbox
   payload, a business object, or a secret; the worker reloads the authoritative row from
   Postgres.
3. If Redis is unreachable, the `queue.add()` call fails fast (the shared producer connection in
   `lib/redis.ts` uses `maxRetriesPerRequest: 1`) and the row is left `PENDING` with an
   exponential backoff (`nextAttemptAt`) for the next pass. The business transaction that wrote
   the row already committed and returned - it never waits on Redis.
4. An event type with no configured queue (see `DOMAIN_TO_QUEUE` in `src/jobs/registry.ts`) is a
   permanent routing error, not a transient one: the dispatcher marks it `FAILED` immediately
   instead of retrying forever.
5. The worker's processor loads the outbox row by `outboxId`, does its one idempotent side
   effect, and updates the row to `SENT` (or the job throws and BullMQ retries with backoff; once
   attempts are exhausted the worker marks the row `FAILED`). A processor that sees a row already
   `SENT` treats it as a no-op - safe for BullMQ's at-least-once delivery.

`GET /api/health` already reports `database` and `queue` (Redis ping) health separately - queue
degradation never blocks or reverses a committed business transaction.

## Adding a new BullMQ job

1. Pick an `eventType` name `"<domain>.<action>"` where `<domain>` is one of `notification`,
   `export`, `conversion`, `maintenance` (see `DOMAIN_TO_QUEUE` in `src/jobs/registry.ts`) - this
   is what routes the row to a queue.
2. Write a processor: `async (job: Job<OutboxJobData>) => { ... }` in
   `src/jobs/processors/<domain>.ts`. Reload the outbox row (and any other state) from Postgres
   by `job.data.outboxId`; make it safe to run twice (check status, use upserts/conditional
   updates).
3. Register it in `JOB_PROCESSORS` in `src/jobs/registry.ts`. `queuesWithProcessors()` picks it
   up automatically, so the worker starts a `Worker` for that queue the next time it boots.
4. From the business transaction that produces the event, call `enqueueOutboxEvent(tx, {
   eventType, payload, idempotencyKey })` - `payload` is whatever the processor needs to look up
   its own state (an ID, not a snapshot), and `idempotencyKey` should be unique per business
   event (e.g. `` `invoice:${invoiceId}:sent` ``).

No route or Server Action ever calls BullMQ directly - it only ever writes an outbox row inside
its own transaction and lets the dispatcher take it from there.
