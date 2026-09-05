# Socket.IO realtime infrastructure

Reusable realtime layer per `docs/DealFlow360_Technical_Architecture_Document.md` SS23. Rooms,
auth, and the event contract only - no business feature emits into it yet. PostgreSQL stays
authoritative; Socket.IO only tells a client "go refetch", never carries the source of truth.

## Running it

```
npm run dev     # custom server (Next.js + Socket.IO) with Turbopack, auto-restart on change
npm run build   # unchanged: next build --turbopack
npm run start   # same custom server, production mode, against the build output
```

There's no separate "start the socket server" step - `server.ts` is the whole app's entry point
now (it wraps Next's own request handler in a plain `http.Server` and attaches Socket.IO to the
same port), replacing plain `next dev`/`next start`.

### Why a custom server, and why not tsx

Socket.IO needs a long-lived `http.Server` it can attach to; `next dev`/`next start` don't expose
one (TAD ADR-001: "Persistent Socket.IO needs custom Node hosting"). `server.ts` boots Next
programmatically (`next({ dev, turbopack })`) and creates that server itself.

`server.ts` runs via `node --experimental-strip-types`, **not** `tsx`/`ts-node`. Running it
through tsx crashes on the very first request that touches `clerkMiddleware`: tsx's runtime CJS
transform hook intercepts Next's *own* internal `require()` of `async-local-storage.js` (which
Clerk's `auth()` needs), producing a second, divergent module instance and tripping Next's
"AsyncLocalStorage accessed in runtime where it is not available" invariant. Node's native type
stripping only erases type syntax at parse time - it never patches module loading, so Next's
internals load exactly as they do under plain `next dev`/`next start`.

Two consequences of running this way, both handled already:

- **Path aliases and extensions.** Native Node ESM doesn't understand this project's `@/*` alias
  or extensionless imports. `loader/ts-alias-loader.mjs` is a small, native `resolve`-only hook
  (registered via `--experimental-loader` in the `dev`/`start` scripts) that rewrites both to
  real file paths before handing resolution back to Node. It never transforms file *content*, so
  it can't reintroduce the tsx problem above.
- **`@clerk/nextjs/server`'s published ESM build has a real bug** for plain-Node ESM consumers:
  its barrel re-exports an internal module via a relative import missing a file extension, which
  bundlers tolerate but Node's native resolver rejects. `src/realtime/authentication.ts` imports
  `createClerkClient`/`verifyToken` from `@clerk/backend` directly instead (the same underlying
  package `@clerk/nextjs/server` re-exports from), and the Clerk-identity-mapping helpers it
  shares with the REST path live in `src/lib/auth/clerk-mapping.ts`, which has no `@clerk/nextjs`
  import at all - keeping that whole broken import path out of the socket server's dependency
  graph. `src/lib/auth/server.ts` (Next request-scoped `auth()`/`currentUser()`, used by REST) is
  unaffected and still uses `@clerk/nextjs/server` normally.

## Authentication

The Socket.IO handshake never runs through Next's middleware/request lifecycle, so it can't use
`auth()`/`currentUser()`. Instead, per Socket.IO's documented credential channel, the client sends
its Clerk session token via the connection's `auth` payload:

```ts
io(url, { auth: (cb) => cb({ token: await getToken() }) });
```

`src/realtime/authentication.ts` verifies that token with `@clerk/backend`, looks up the Clerk
user's `publicMetadata.role`, and resolves the same internal Actor (`{id, role, customerId}`)
the REST API uses (`src/lib/auth/clerk-mapping.ts`) - never trusting a client-supplied id/role.
A non-production `devUserId` bypass mirrors REST's `x-dev-user-id` header for local tooling/tests.

## Authorization: rooms

`src/realtime/rooms.ts` defines the six supported patterns: `user:{id}`, `role:{role}`,
`quotation:{id}`, `customer:{id}`, `warehouse:{id}`, `document:{id}`. A client asks to join one
via `socket.emit("room:join", { room }, ack)`; `src/realtime/authorization.ts` decides per room
kind from the server-resolved actor, mirroring each resource's existing REST read policy (see the
comments there for the one deliberate exception - `customer:{id}` - and why `document:{id}` is
always denied for now: no Document model exists yet). Every socket auto-joins its own `user:{id}`
and (for internal roles) `role:{role}` room on connect - both are always self-authorized.

## Emitting events

```ts
import { emitRealtimeEvent } from "@/realtime/emit";
import { roomName } from "@/realtime/rooms";

// after your business transaction has committed:
emitRealtimeEvent(roomName("quotation", quotation.id), "quotation:updated", {
  id: quotation.id,
  status: quotation.status,
});
```

Call this **after** commit, never inside a transaction (TAD §5/§24A). `emitRealtimeEvent` never
throws: an invalid payload (checked against `src/realtime/events.ts`'s Zod schema) is logged and
dropped, and a not-yet-started or failed Socket.IO server is logged and skipped - either way the
already-committed business result is unaffected. See `src/realtime/events.ts` for the full typed
event contract (16 events) and exactly what each payload may contain.

## Client usage

```ts
import { useRealtimeEvent, useRealtimeRoom, useRealtimeReconnect } from "@/hooks/use-realtime";

useRealtimeRoom(quotationId ? `quotation:${quotationId}` : null);
useRealtimeEvent("quotation:updated", () => refetchQuotation());
useRealtimeReconnect(() => refetchQuotation());
```

The payload passed to `onEvent` is a hint, not data - always refetch via REST. Socket.IO defaults
to at-most-once delivery, so `useRealtimeReconnect` (fires on the first connect and every
reconnect) is how a client that was ever disconnected catches up, instead of assuming any missed
events were delivered.

## Adding a new event

1. Add the name to `REALTIME_EVENT_NAMES` and a Zod schema to `REALTIME_EVENT_SCHEMAS` in
   `src/realtime/events.ts` - ids/status/version/changed-fields only, never secrets or full
   records.
2. Call `emitRealtimeEvent(room, "your:event", payload)` after your transaction commits.
3. Consume it with `useRealtimeEvent("your:event", handler)` on the client.

No route or Server Action ever calls `getIO()`/BullMQ directly for business logic - it only ever
commits its transaction and then calls `emitRealtimeEvent`.
