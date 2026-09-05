import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson, parseQuery } from "@/lib/route-handler";
import { approvalRuleService } from "@/modules/approval";
import { approvalRuleQuerySchema, createApprovalRuleSchema } from "@/modules/approval/schemas/approval-rule";

export async function GET(request: NextRequest) {
  return api(async () =>
    approvalRuleService.list(await getRequestActor(request), parseQuery(request, approvalRuleQuerySchema)),
  );
}

export async function POST(request: NextRequest) {
  return api(
    async () =>
      approvalRuleService.create(await getRequestActor(request), await parseJson(request, createApprovalRuleSchema)),
    201,
  );
}
