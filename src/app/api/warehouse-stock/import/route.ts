import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { warehouseStockService } from "@/modules/stock";
import { importWarehouseStockSchema } from "@/modules/stock/schemas/warehouse-stock";

export async function POST(request: NextRequest) {
  return api(
    async () =>
      warehouseStockService.import(
        await getRequestActor(request),
        await parseJson(request, importWarehouseStockSchema),
      ),
    201,
  );
}
