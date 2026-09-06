import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { userService } from "@/modules/users";
import { createUserSchema } from "@/modules/users/schemas/user";

export async function GET(request: NextRequest) {
  return api(async () => userService.list(await getRequestActor(request)));
}

export async function POST(request: NextRequest) {
  return api(
    async () => userService.create(await getRequestActor(request), await parseJson(request, createUserSchema)),
    201,
  );
}
