import type { NextRequest } from "next/server";

import type { Actor } from "@/modules/shared/domain/actor";

export type RequestActorResolver = (request: NextRequest) => Promise<Actor | null>;

let resolver: RequestActorResolver | undefined;

/** T1 installs its Clerk-backed resolver here. The default is deliberately fail-closed. */
export function registerRequestActorResolver(nextResolver: RequestActorResolver) {
  resolver = nextResolver;
}

export async function getRequestActor(request: NextRequest) {
  return resolver ? resolver(request) : null;
}
