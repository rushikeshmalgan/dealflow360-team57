/**
 * Client-side fetch helper for this codebase's own Route Handlers, which respond with the
 * Supports both the current {data, requestId} route-handler envelope and the
 * {success, data} / {success:false, error} envelope from lib/api-response.ts.
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
