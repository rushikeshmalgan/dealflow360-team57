import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { negotiationResolutionService, resolveNegotiationSchema } from "@/modules/negotiation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string; negotiationId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { id, negotiationId } = await params;
  return api(async () =>
    negotiationResolutionService.resolve(
      await getRequestActor(request),
      idSchema.parse(id),
      idSchema.parse(negotiationId),
      await parseJson(request, resolveNegotiationSchema),
    ),
  );
}
