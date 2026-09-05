import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { categoryService } from "@/modules/catalog";
import { updateCategorySchema } from "@/modules/catalog/schemas/category";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () => categoryService.get(await getRequestActor(request), idSchema.parse((await params).id)));
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    categoryService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateCategorySchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(async () => categoryService.delete(await getRequestActor(request), idSchema.parse((await params).id)), 204);
}
