import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { subscriptionService } from "@/modules/subscription";
import { modifySubscriptionSchema } from "@/modules/subscription/schemas/subscription";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(async () =>
    subscriptionService.modify(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, modifySubscriptionSchema),
    ),
  );
}
