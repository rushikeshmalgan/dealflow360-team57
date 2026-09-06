import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { recommendationService } from "@/modules/recommendation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

/** Current PENDING recommendations for one quotation, without re-running generation — the
 * pane's mount-time fetch. Call POST /api/recommendations first (or after a line changes) to
 * (re-)generate. */
export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    recommendationService.list(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}
