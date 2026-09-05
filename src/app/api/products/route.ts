import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { productService } from "@/modules/catalog";
import { createProductSchema, productListQuerySchema } from "@/modules/catalog/schemas/product";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return api(async () => productService.list(await getRequestActor(request), parseQuery(request, productListQuerySchema)));
}

export async function POST(request: NextRequest) {
  return api(
    async () => productService.create(await getRequestActor(request), await parseJson(request, createProductSchema)),
    201,
  );
}
