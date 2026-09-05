import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { ServiceError } from "@/lib/service-error";
import { invoiceService } from "@/modules/invoice";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () => {
    const invoice = await invoiceService.get(await getRequestActor(request), idSchema.parse((await params).id));
    if (!invoice) throw new ServiceError("NOT_FOUND", "Invoice not found");
    return invoice;
  });
}
