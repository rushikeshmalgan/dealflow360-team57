import type { NextRequest } from "next/server";

import type { Actor } from "@/modules/shared/domain/actor";

import { resolveRequestActor } from "./auth/resolve-actor";

export type RequestActorResolver = (request: NextRequest) => Promise<Actor | null>;

// Defaults to the real Clerk-backed resolver (src/lib/auth/resolve-actor.ts). Kept overridable
// (rather than calling resolveRequestActor directly from every route) so tests — or a future
// identity source — can swap it out without touching every Route Handler.
let resolver: RequestActorResolver = resolveRequestActor;

export function registerRequestActorResolver(nextResolver: RequestActorResolver) {
  resolver = nextResolver;
}

export async function getRequestActor(request: NextRequest) {
  return resolver(request);
}
