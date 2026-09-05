import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { warehouseService } from "@/modules/warehouse";
import { createWarehouseSchema } from "@/modules/warehouse/schemas/warehouse";

export async function GET(request: NextRequest) {
  return api(async () => warehouseService.list(await getRequestActor(request)));
}

export async function POST(request: NextRequest) {
  return api(
    async () =>
      warehouseService.create(
        await getRequestActor(request),
        await parseJson(request, createWarehouseSchema),
      ),
    201,
  );
}
