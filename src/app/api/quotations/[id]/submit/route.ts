import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { submitQuotationUseCase } from "@/modules/quotation";
import { submitQuotationSchema } from "@/modules/quotation/schemas/quotation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(async () =>
    submitQuotationUseCase.execute(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, submitQuotationSchema),
    ),
  );
}
