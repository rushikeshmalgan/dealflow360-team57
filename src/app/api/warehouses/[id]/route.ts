import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { warehouseService } from "@/modules/warehouse";
import { updateWarehouseSchema } from "@/modules/warehouse/schemas/warehouse";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    warehouseService.get(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    warehouseService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateWarehouseSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(
    async () =>
      warehouseService.delete(await getRequestActor(request), idSchema.parse((await params).id)),
    204,
  );
}
