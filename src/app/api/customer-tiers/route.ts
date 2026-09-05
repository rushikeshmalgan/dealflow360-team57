import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { tierService } from "@/modules/customers";
import { createTierSchema } from "@/modules/customers/schemas/tier";

export async function GET(request: NextRequest) {
  return api(async () => tierService.list(await getRequestActor(request)));
}

export async function POST(request: NextRequest) {
  return api(async () => tierService.create(await getRequestActor(request), await parseJson(request, createTierSchema)), 201);
}
