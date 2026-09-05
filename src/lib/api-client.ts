/**
 * Client-side fetch helper for this codebase's own Route Handlers, which respond with the
 * {success, data} / {success:false, error} envelope from lib/api-response.ts (TAD SS30).
 * Also tolerates a non-JSON response (e.g. Next's own 404 page) for endpoints a teammate
 * hasn't built yet, so the UI can show a clear message instead of a crash.
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

  if (body && typeof body === "object" && "success" in body) {
    const envelope = body as { success: boolean; data?: T; error?: ApiEnvelopeError };
    if (envelope.success) {
      return envelope.data as T;
    }
    throw new ApiClientError(
      envelope.error ?? { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    );
  }

  throw new ApiClientError({
    code: "INTERNAL_ERROR",
    message: "Unexpected response shape from the server.",
  });
}
