/**
 * Client-side fetch helper for this codebase's own Route Handlers.
 *
 * Every real route (see lib/route-handler.ts's `api()`) responds with `{data, requestId}` on
 * success and `{error: {code, message, details, requestId}}` on failure — no top-level
 * `success` flag. (lib/api-response.ts defines an older `{success, data}` shape, but nothing
 * except the unused src/app/api/example route ever returns it; this client used to assume that
 * shape, which meant every real call fell through to "Unexpected response shape from the
 * server." — this now matches what the API actually sends, and still tolerates the old shape
 * in case anything is ever written against api-response.ts.) Also tolerates a non-JSON response
 * (e.g. Next's own 404 page) for endpoints a teammate hasn't built yet, so the UI can show a
 * clear message instead of a crash.
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
    // Real shape (lib/route-handler.ts): {data, requestId} on success, {error: {...}} on failure.
    if ("error" in body) {
      const envelope = body as { error?: ApiEnvelopeError };
      throw new ApiClientError(
        envelope.error ?? { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      );
    }
    if ("data" in body) {
      return (body as { data: T }).data;
    }
    // Legacy shape (lib/api-response.ts): {success, data} / {success: false, error}.
    if ("success" in body) {
      const envelope = body as { success: boolean; data?: T; error?: ApiEnvelopeError };
      if (envelope.success) {
        return envelope.data as T;
      }
      throw new ApiClientError(
        envelope.error ?? { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      );
    }
  }

  throw new ApiClientError({
    code: "INTERNAL_ERROR",
    message: "Unexpected response shape from the server.",
  });
}
