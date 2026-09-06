import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { recommendationService } from "@/modules/recommendation";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

/** The rep dismissing their own quote's suggestion — sticky (never resurfaced by re-generation). */
export async function POST(request: NextRequest, { params }: Context) {
  return api(async () =>
    recommendationService.dismiss(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}
