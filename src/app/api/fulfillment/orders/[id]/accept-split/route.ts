import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { fulfillmentService } from "@/modules/fulfillment";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(async () =>
    fulfillmentService.acceptSuggestedSplit(
      await getRequestActor(request),
      idSchema.parse((await params).id),
    ),
  );
}
