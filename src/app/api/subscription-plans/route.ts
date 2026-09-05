import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { planService } from "@/modules/subscription";
import { createPlanSchema, planListQuerySchema } from "@/modules/subscription/schemas/plan";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return api(async () => planService.list(await getRequestActor(request), parseQuery(request, planListQuerySchema)));
}

export async function POST(request: NextRequest) {
  return api(
    async () => planService.create(await getRequestActor(request), await parseJson(request, createPlanSchema)),
    201,
  );
}
