import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { categoryService } from "@/modules/catalog";
import { createCategorySchema } from "@/modules/catalog/schemas/category";

export async function GET(request: NextRequest) {
  return api(async () => categoryService.list(await getRequestActor(request)));
}

export async function POST(request: NextRequest) {
  return api(
    async () => categoryService.create(await getRequestActor(request), await parseJson(request, createCategorySchema)),
    201,
  );
}
