import { createServer } from "node:http";

import next from "next";

import { initRealtimeServer } from "@/realtime/socket-server";

/**
 * Custom Node server (TAD ADR-001/§23: "Persistent Socket.IO needs custom Node hosting").
 * Next.js's own `next dev`/`next start` can't host a long-lived Socket.IO connection, so this
 * wraps Next's request handler in a plain http.Server and attaches Socket.IO to the same
 * server/port - one process, one deployable, matching TAD §31's "no multiple deployables" rule.
 *
 * Run this with Node's own `--experimental-strip-types` (see the `dev`/`start` package.json
 * scripts), never through tsx/ts-node: those register a runtime CJS transform hook that
 * intercepts Next's *own* internal require of async-local-storage.js (used by clerkMiddleware's
 * AsyncLocalStorage-based auth() context), producing a second, divergent module instance and
 * crashing every request with "AsyncLocalStorage accessed in runtime where it is not available".
 * Node's native type-stripping only erases type syntax - it never touches module loading, so
 * Next's internals load exactly as they do under plain `next dev`/`next start`.
 *
 * The `--experimental-loader=./loader/ts-alias-loader.mjs` flag (also in the `dev`/`start`
 * scripts) is a separate, much narrower native hook: it only rewrites this project's "@/*"
 * alias and extensionless relative imports to real file paths before handing resolution back to
 * Node - it never transforms file contents, so it doesn't reintroduce the problem above.
 */
const dev = process.argv.includes("--dev") || process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port, turbopack: dev });
const handler = app.getRequestHandler();

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handler(req, res).catch((error) => {
      console.error("[server] request handler error", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  });

  try {
    initRealtimeServer(httpServer);
    console.log("[server] Socket.IO realtime layer attached");
  } catch (error) {
    // Realtime is best-effort (TAD SS45/SS50): REST/pages must keep working even if Socket.IO
    // fails to start.
    console.error("[server] failed to start Socket.IO; continuing without realtime", error);
  }

  httpServer.listen(port, () => {
    console.log(`[server] ready on http://${hostname}:${port} (${dev ? "dev" : "production"})`);
  });
}

main().catch((error) => {
  console.error("[server] fatal startup error", error);
  process.exit(1);
});
