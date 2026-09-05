import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { dealHealthService } from "@/modules/deal-health";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

/** One quotation's current deal-health rollup (healthy/warning/critical + its alerts). */
export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    dealHealthService.getQuotationHealth(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}
