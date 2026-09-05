import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { discountRuleService } from "@/modules/discount-risk";
import {
  createDiscountRuleSchema,
  discountRuleQuerySchema,
  resolveCeilingQuerySchema,
} from "@/modules/discount-risk/schemas/discount-rule";

export async function GET(request: NextRequest) {
  return api(async () => {
    const actor = await getRequestActor(request);
    const params = new URL(request.url).searchParams;
    if (params.has("resolve")) {
      const input = parseQuery(request, resolveCeilingQuerySchema);
      return discountRuleService.resolveCeiling(actor, input.tierId, input.categoryId ?? null);
    }
    return discountRuleService.list(actor, parseQuery(request, discountRuleQuerySchema));
  });
}

export async function POST(request: NextRequest) {
  return api(
    async () =>
      discountRuleService.create(await getRequestActor(request), await parseJson(request, createDiscountRuleSchema)),
    201,
  );
}
