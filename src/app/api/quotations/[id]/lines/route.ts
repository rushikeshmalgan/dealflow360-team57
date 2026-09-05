import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { quotationService } from "@/modules/quotation";
import { addQuotationLineSchema } from "@/modules/quotation/schemas/quotation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(
    async () =>
      quotationService.addLine(
        await getRequestActor(request),
        idSchema.parse((await params).id),
        await parseJson(request, addQuotationLineSchema),
      ),
    201,
  );
}
