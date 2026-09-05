import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { subscriptionService } from "@/modules/subscription";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(async () => {
    const actor = await getRequestActor(request);
    const id = idSchema.parse((await params).id);

    let body: Record<string, unknown> = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      body = {};
    }

    let expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : undefined;
    if (expectedVersion === undefined) {
      const current = await subscriptionService.get(actor, id);
      expectedVersion = current.version;
    }

    return subscriptionService.cancel(actor, id, {
      reason: typeof body.reason === "string" ? body.reason : undefined,
      immediate: typeof body.immediate === "boolean" ? body.immediate : true,
      cancelDate: typeof body.cancelDate === "string" ? body.cancelDate : undefined,
      expectedVersion,
    });
  });
}
