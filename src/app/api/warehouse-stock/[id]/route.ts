import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { warehouseStockService } from "@/modules/stock";
import { updateWarehouseStockSchema } from "@/modules/stock/schemas/warehouse-stock";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    warehouseStockService.get(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    warehouseStockService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateWarehouseStockSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(
    async () =>
      warehouseStockService.delete(
        await getRequestActor(request),
        idSchema.parse((await params).id),
      ),
    204,
  );
}
