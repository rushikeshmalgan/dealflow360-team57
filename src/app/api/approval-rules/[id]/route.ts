import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestActor } from "@/lib/request-actor";
import { api, parseJson } from "@/lib/route-handler";
import { approvalRuleService } from "@/modules/approval";
import { updateApprovalRuleSchema } from "@/modules/approval/schemas/approval-rule";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  return api(async () =>
    approvalRuleService.get(await getRequestActor(request), idSchema.parse((await params).id)),
  );
}

export async function PUT(request: NextRequest, { params }: Context) {
  return api(async () =>
    approvalRuleService.update(
      await getRequestActor(request),
      idSchema.parse((await params).id),
      await parseJson(request, updateApprovalRuleSchema),
    ),
  );
}

export async function DELETE(request: NextRequest, { params }: Context) {
  return api(
    async () => approvalRuleService.delete(await getRequestActor(request), idSchema.parse((await params).id)),
    204,
  );
}
