import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { quotationService } from "@/modules/quotation";
import {
  createQuotationSchema,
  quotationListQuerySchema,
} from "@/modules/quotation/schemas/quotation";

export async function GET(request: NextRequest) {
  return api(async () =>
    quotationService.list(
      await getRequestActor(request),
      parseQuery(request, quotationListQuerySchema),
    ),
  );
}

export async function POST(request: NextRequest) {
  return api(
    async () =>
      quotationService.create(
        await getRequestActor(request),
        await parseJson(request, createQuotationSchema),
      ),
    201,
  );
}
