import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { negotiationResolutionService } from "@/modules/negotiation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    negotiationResolutionService.getPending(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}
