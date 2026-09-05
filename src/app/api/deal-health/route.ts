import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseQuery } from "@/lib/route-handler";
import { dealHealthService } from "@/modules/deal-health";
import { dealHealthListQuerySchema } from "@/modules/deal-health/schemas/deal-health";

/** TAD SS34/§29: `GET /api/deal-health` - Manager/Admin scope, Finance/Ops operational scope,
 * a Sales Rep scoped to their own quotations only (see DealHealthService.listAlerts). */
export async function GET(request: NextRequest) {
  return api(async () =>
    dealHealthService.listAlerts(
      await getRequestActor(request),
      parseQuery(request, dealHealthListQuerySchema),
    ),
  );
}
