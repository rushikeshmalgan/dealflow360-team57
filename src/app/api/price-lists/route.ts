import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { requireInternal } from "@/modules/shared/domain/actor";
import { pricingService } from "@/modules/pricing";
import {
  createPriceListSchema,
  priceListQuerySchema,
  resolvePriceQuerySchema,
} from "@/modules/pricing/schemas/price-list";

export async function GET(request: NextRequest) {
  return api(async () => {
    const actor = await getRequestActor(request);
    requireInternal(actor);
    const params = new URL(request.url).searchParams;
    if (params.has("productId") || params.has("customerTierId")) {
      const input = parseQuery(request, resolvePriceQuerySchema);
      return pricingService.resolvePrice(input.customerTierId, input.productId, input.variantId, input.currency);
    }
    return pricingService.list(actor, parseQuery(request, priceListQuerySchema));
  });
}

export async function POST(request: NextRequest) {
  return api(
    async () => pricingService.save(await getRequestActor(request), await parseJson(request, createPriceListSchema)),
    201,
  );
}
