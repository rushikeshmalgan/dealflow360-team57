import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { customerService } from "@/modules/customers";
import { updateCustomerSchema } from "@/modules/customers/schemas/customer";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () => customerService.get(await getRequestActor(request), idSchema.parse((await params).id)));
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    customerService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateCustomerSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(async () => customerService.delete(await getRequestActor(request), idSchema.parse((await params).id)), 204);
}
