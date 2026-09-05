import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { invoiceService } from "@/modules/invoice";
import { createInvoiceSchema, invoiceListQuerySchema } from "@/modules/invoice/schemas/invoice";

export async function GET(request: NextRequest) {
  return api(async () =>
    invoiceService.list(await getRequestActor(request), parseQuery(request, invoiceListQuerySchema)),
  );
}

export async function POST(request: NextRequest) {
  return api(
    async () =>
      invoiceService.create(await getRequestActor(request), await parseJson(request, createInvoiceSchema)),
    201,
  );
}
