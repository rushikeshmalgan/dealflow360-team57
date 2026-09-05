import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { invoiceService } from "@/modules/invoice";
import { recordPaymentSchema } from "@/modules/invoice/schemas/invoice";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(
    async () =>
      invoiceService.recordPayment(
        await getRequestActor(request),
        idSchema.parse((await params).id),
        await parseJson(request, recordPaymentSchema),
      ),
    201,
  );
}
