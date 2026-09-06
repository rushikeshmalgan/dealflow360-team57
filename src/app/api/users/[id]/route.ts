import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { userService } from "@/modules/users";
import { updateUserSchema } from "@/modules/users/schemas/user";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    userService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateUserSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(async () => userService.delete(await getRequestActor(request), idSchema.parse((await params).id)), 204);
}
