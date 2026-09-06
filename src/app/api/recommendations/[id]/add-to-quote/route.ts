import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { recommendationService } from "@/modules/recommendation";
import { addRecommendationToQuoteSchema } from "@/modules/recommendation/schemas/recommendation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

/** TAD SS15: "accepted product becomes line; recalc margin/risk." The actual line creation,
 * pricing, permission, and Draft-state validation all happen inside QuotationService.addLine
 * (see RecommendationService.addToQuote) — this route never duplicates that logic. */
export async function POST(request: NextRequest, { params }: Context) {
  return api(async () =>
    recommendationService.addToQuote(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, addRecommendationToQuoteSchema),
    ),
  );
}
