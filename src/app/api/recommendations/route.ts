import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { recommendationService } from "@/modules/recommendation";
import { generateRecommendationsSchema } from "@/modules/recommendation/schemas/recommendation";

/** TAD SS15: "POST /api/recommendations | quotationVersionId | Rep access | top-K" — this
 * implementation takes `quotationId` (see the Recommendation model's Prisma comment for why).
 * Idempotent/repeatable: re-scores and re-persists the top-K, sticky against prior ADDED/DISMISSED decisions. */
export async function POST(request: NextRequest) {
  return api(async () =>
    recommendationService.generate(
      await getRequestActor(request),
      (await parseJson(request, generateRecommendationsSchema)).quotationId,
    ),
  );
}
