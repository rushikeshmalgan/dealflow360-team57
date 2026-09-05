import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseQuery } from "@/lib/route-handler";
import { subscriptionService } from "@/modules/subscription";
import {
  createSubscriptionSchema,
  subscriptionListQuerySchema,
} from "@/modules/subscription/schemas/subscription";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return api(async () =>
    subscriptionService.list(
      await getRequestActor(request),
      parseQuery(request, subscriptionListQuerySchema),
    ),
  );
}

export async function POST(request: NextRequest) {
  return api(async () => {
    const actor = await getRequestActor(request);
    const body = await request.json();

    // Check if this is quotation billing plan creation (T10.1) or direct subscription creation
    if (body && typeof body === "object" && "quotationId" in body && !("planId" in body)) {
      return subscriptionService.createFromQuotation(actor, {
        quotationId: String(body.quotationId),
      });
    }

    const validated = createSubscriptionSchema.parse(body);
    return subscriptionService.create(actor, validated);
  }, 201);
}
