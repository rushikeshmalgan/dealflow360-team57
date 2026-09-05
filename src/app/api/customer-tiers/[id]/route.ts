import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { tierService } from "@/modules/customers";
import { updateTierSchema } from "@/modules/customers/schemas/tier";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () => tierService.get(await getRequestActor(request), idSchema.parse((await params).id)));
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    tierService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateTierSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(async () => tierService.delete(await getRequestActor(request), idSchema.parse((await params).id)), 204);
}
