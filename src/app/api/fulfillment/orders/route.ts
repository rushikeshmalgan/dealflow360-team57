import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { fulfillmentService } from "@/modules/fulfillment";

export async function GET(request: NextRequest) {
  return api(async () => fulfillmentService.list(await getRequestActor(request)));
}
