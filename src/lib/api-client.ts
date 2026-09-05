/**
 * Client-side fetch helper for this codebase's Route Handlers.
 * Supports both current `{data, requestId}` responses and legacy
 * `{success, data}` responses.
 */
export type ApiEnvelopeError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(error: ApiEnvelopeError) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.details = error.details;
  }
}

export async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message: "Could not reach the server. Is the backend running?",
    });
  }

  // route-handler.ts's api() sends a bodyless 204 for successful deletes — nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError({
      code: response.status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
      message:
        response.status === 404
          ? "This endpoint isn't available yet."
          : `Unexpected response from the server (HTTP ${response.status}).`,
    });
  }

  if (body && typeof body === "object") {
    const envelope = body as {
      success?: boolean;
      data?: T;
      error?: ApiEnvelopeError;
      requestId?: string;
    };

    if (envelope.success === true) {
      return envelope.data as T;
    }

    if (Object.prototype.hasOwnProperty.call(envelope, "data") && !envelope.error) {
      return envelope.data as T;
    }

    if (envelope.error) {
      throw new ApiClientError(envelope.error);
    }
  }

  throw new ApiClientError({
    code: "INTERNAL_ERROR",
    message: "Unexpected response shape from the server.",
  });
}
