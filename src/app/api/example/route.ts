import { NextResponse } from "next/server";
import { z } from "zod";

import { okResponse, parseJsonBody, withErrorHandling } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

/**
 * T0.3 reference implementation only: demonstrates the full error-envelope round trip
 * (a Zod validation failure and a typed business error) that every real Route Handler
 * built in later epics must follow. Not a domain endpoint.
 */
const bodySchema = z.object({
  value: z.string().min(1, "value must not be empty"),
});

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const { value } = await parseJsonBody(request, bodySchema);

  if (value === "conflict") {
    throw AppError.versionConflict("Example resource has a newer version", {
      expectedVersion: 1,
      currentVersion: 2,
    });
  }

  return okResponse({ echoed: value });
});
