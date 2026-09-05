import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { dealHealthService } from "@/modules/deal-health";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

/**
 * On-demand refresh (TAD SS34). Enqueues the same `deal-health.evaluate` BullMQ job the
 * scheduler uses and returns immediately - the evaluation itself commits to Postgres and emits
 * `deal-health:updated` asynchronously (TAD SS5/§34: "after health state is committed"), so the
 * client refetches via GET /api/deal-health/quotations/{id} once notified, exactly like the
 * export-request pattern elsewhere in this API (202 now, real result via event + refetch).
 */
export async function POST(request: NextRequest, { params }: Context) {
  return api(async () => {
    const quotationId = idSchema.parse((await params).id);
    await dealHealthService.refreshQuotation(await getRequestActor(request), quotationId);
    return { status: "queued", quotationId };
  }, 202);
}
