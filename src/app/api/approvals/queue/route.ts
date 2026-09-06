import type { NextRequest } from "next/server";

import { getRequestActor } from "@/lib/request-actor";
import { api } from "@/lib/route-handler";
import { approvalRecordService } from "@/modules/approval";

export async function GET(request: NextRequest) {
  return api(async () => approvalRecordService.listQueue(await getRequestActor(request)));
}
