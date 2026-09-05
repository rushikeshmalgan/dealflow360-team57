import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { warehouseStockService } from "@/modules/stock";
import {
  createWarehouseStockSchema,
  warehouseStockQuerySchema,
} from "@/modules/stock/schemas/warehouse-stock";

export async function GET(request: NextRequest) {
  return api(async () =>
    warehouseStockService.list(
      await getRequestActor(request),
      parseQuery(request, warehouseStockQuerySchema),
    ),
  );
}

export async function POST(request: NextRequest) {
  return api(
    async () =>
      warehouseStockService.create(
        await getRequestActor(request),
        await parseJson(request, createWarehouseStockSchema),
      ),
    201,
  );
}
