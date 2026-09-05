import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { discountRuleService } from "@/modules/discount-risk";
import { updateDiscountRuleSchema } from "@/modules/discount-risk/schemas/discount-rule";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    discountRuleService.get(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}

export async function PUT(request: NextRequest, { params }: Context) {
  return api(async () =>
    discountRuleService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateDiscountRuleSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(
    async () => discountRuleService.delete(await getRequestActor(request), idSchema.parse((await params).id)),
    204,
  );
}
