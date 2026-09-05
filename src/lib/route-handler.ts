import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { ServiceError } from "@/lib/service-error";

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ServiceError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(request.url).searchParams));
}

export async function api<T>(work: () => Promise<T>, successStatus = 200) {
  const requestId = randomUUID();
  try {
    const data = await work();
    if (successStatus === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ data, requestId }, { status: successStatus });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: error.flatten(),
            requestId,
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, details: error.details, requestId } },
        { status: error.status },
      );
    }
    console.error("Unhandled route error", { requestId, error });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId } },
      { status: 500 },
    );
  }
}
