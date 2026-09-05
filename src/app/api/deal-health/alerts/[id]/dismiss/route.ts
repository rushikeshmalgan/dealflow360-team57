import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { dealHealthService } from "@/modules/deal-health";
import { dismissAlertSchema } from "@/modules/deal-health/schemas/deal-health";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

/** Manager/Admin dismisses one alert (sticky - the evaluator won't reopen it on its own while
 * the underlying condition stays active; see DealHealthService.dismissAlert). */
export async function POST(request: NextRequest, { params }: Context) {
  return api(async () => {
    // The reason isn't persisted (no column for it) but is still validated so a caller gets a
    // clear 400 rather than having it silently swallowed - trivial to wire into `details` later.
    await parseJson(request, dismissAlertSchema);
    return dealHealthService.dismissAlert(
      await getRequestActor(request),
      idSchema.parse((await params).id),
    );
  });
}
