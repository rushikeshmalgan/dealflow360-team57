import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { approvalRecordService } from "@/modules/approval";
import { approvalDecisionSchema } from "@/modules/approval/schemas/approval-decision";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ recordId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  return api(async () =>
    approvalRecordService.decide(
      await getRequestActor(request),
      idSchema.parse((await params).recordId),
      await parseJson(request, approvalDecisionSchema),
    ),
  );
}
