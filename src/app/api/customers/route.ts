import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { customerService } from "@/modules/customers";
import { createCustomerSchema } from "@/modules/customers/schemas/customer";

export async function GET(request: NextRequest) {
  return api(async () => customerService.list(await getRequestActor(request)));
}

export async function POST(request: NextRequest) {
  return api(
    async () => customerService.create(await getRequestActor(request), await parseJson(request, createCustomerSchema)),
    201,
  );
}
