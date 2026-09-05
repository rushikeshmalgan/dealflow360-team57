import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { productService } from "@/modules/catalog";
import { updateProductSchema } from "@/modules/catalog/schemas/product";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () => productService.get(await getRequestActor(request), idSchema.parse((await params).id)));
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    productService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateProductSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(async () => productService.delete(await getRequestActor(request), idSchema.parse((await params).id)), 204);
}
