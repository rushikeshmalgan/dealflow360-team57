import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { negotiationService } from "@/modules/negotiation";

export async function GET(request: NextRequest) {
  return api(async () => negotiationService.list(await getRequestActor(request)));
}
