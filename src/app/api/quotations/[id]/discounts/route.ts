import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { quotationService } from "@/modules/quotation";
import { updateQuotationDiscountsSchema } from "@/modules/quotation/schemas/quotation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  return api(async () =>
    quotationService.updateDiscounts(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateQuotationDiscountsSchema),
    ),
  );
}
