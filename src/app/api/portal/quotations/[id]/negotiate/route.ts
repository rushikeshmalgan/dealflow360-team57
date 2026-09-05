import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { negotiationService } from "@/modules/negotiation";
import { negotiateQuotationSchema } from "@/modules/negotiation/schemas/negotiation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(async () =>
    negotiationService.negotiate(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, negotiateQuotationSchema),
    ),
  );
}
