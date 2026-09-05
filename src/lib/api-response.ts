import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError } from "@/lib/errors";

/**
 * Success envelope. Route Handlers must pass a DTO here, never a raw Prisma model
 * (DealFlow360_docs/DealFlow360_Technical_Architecture_Document.md SS29: "responses use DTOs,
 * never raw Prisma models").
 */
export function okResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Error envelope per TAD SS30. `requestId` lets the caller correlate a failed response with
 * server-side logs even though no logging pipeline is wired up yet.
 */
function errorResponse(error: AppError, requestId: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? {},
        requestId,
      },
    },
    { status: error.status },
  );
}

/**
 * Wraps a Route Handler so every thrown AppError, ZodError, or unknown error is converted into
 * the same response envelope instead of each handler formatting its own error JSON.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    const requestId = randomUUID();
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AppError) {
        return errorResponse(error, requestId);
      }
      if (error instanceof z.ZodError) {
        return errorResponse(
          AppError.validation("Request validation failed", {
            fieldErrors: error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          }),
          requestId,
        );
      }
      console.error(`[${requestId}] Unhandled error`, error);
      return errorResponse(AppError.internal(), requestId);
    }
  };
}

/**
 * Parses a Route Handler's JSON body against a Zod schema, throwing AppError("VALIDATION_ERROR")
 * on malformed JSON or a failed schema check so callers never hand-roll this branch.
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.infer<Schema>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw AppError.validation("Request body must be valid JSON");
  }
  return schema.parse(body);
}
