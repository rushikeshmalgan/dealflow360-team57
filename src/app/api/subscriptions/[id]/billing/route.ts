import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { subscriptionService } from "@/modules/subscription";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    subscriptionService.getBillingDetail(
      await getRequestActor(request),
      idSchema.parse((await params).id),
    ),
  );
}
