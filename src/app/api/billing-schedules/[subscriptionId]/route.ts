import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { subscriptionService } from "@/modules/subscription";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ subscriptionId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    subscriptionService.getBillingSchedules(
      await getRequestActor(request),
      idSchema.parse((await params).subscriptionId),
    ),
  );
}
