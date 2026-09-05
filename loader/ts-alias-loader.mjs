// Native Node ESM resolve hook (module.register API) for running the custom server (server.ts)
// directly with `node --experimental-strip-types`, with no bundler and no third-party loader.
// It does two things Node's own resolver can't:
//   1. Rewrites this project's "@/*" -> "./src/*" tsconfig path alias.
//   2. Appends the right extension to extensionless relative imports (e.g. "./authentication"),
//      which every file in this codebase uses (the TypeScript/bundler convention) but native
//      Node ESM requires spelled out.
//
// This is intentionally an ESM *resolve* hook only - it never touches `load`/transform for
// anything, and Next.js loads its own internals via plain CJS `require()` (a completely
// separate pipeline). That separation matters: running server.ts through tsx instead crashes
// every request, because tsx's CJS transform hook intercepts Next's *own* internal require of
// async-local-storage.js (used by clerkMiddleware's AsyncLocalStorage-based auth() context),
// producing a second, divergent module instance. A pure ESM resolve hook can't cause that -
// Node's built-in type-stripping (already active via --experimental-strip-types) still handles
// turning each resolved .ts file's syntax into runnable JS.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveToFile(basePath, specifier) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = basePath + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`[ts-alias-loader] Cannot resolve "${specifier}" to a file under src/`);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const filePath = resolveToFile(path.join(srcDir, specifier.slice(2)), specifier);
    return nextResolve(pathToFileURL(filePath).href, context);
  }

  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && !path.extname(specifier) && context.parentURL) {
    const importerDir = path.dirname(fileURLToPath(context.parentURL));
    const filePath = resolveToFile(path.join(importerDir, specifier), specifier);
    return nextResolve(pathToFileURL(filePath).href, context);
  }

  return nextResolve(specifier, context);
}
