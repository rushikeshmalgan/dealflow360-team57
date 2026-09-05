/**
 * Typed error-code envelope per DealFlow360_docs/DealFlow360_Technical_Architecture_Document.md SS30.
 * Every Route Handler throws AppError (or lets a ZodError/unknown error surface) and returns its
 * response through withErrorHandling() from api-response.ts, so the wire format never diverges
 * between modules.
 */

export const ERROR_STATUS_MAP = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE_TRANSITION: 409,
  VERSION_CONFLICT: 409,
  ALREADY_ACTIONED: 409,
  FILE_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS_MAP;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_STATUS_MAP[this.code];
  }

  static validation(message: string, details?: Record<string, unknown>) {
    return new AppError("VALIDATION_ERROR", message, details);
  }

  static authenticationRequired(message = "Authentication is required") {
    return new AppError("AUTHENTICATION_REQUIRED", message);
  }

  static forbidden(message = "You do not have access to this resource") {
    return new AppError("FORBIDDEN", message);
  }

  static notFound(message = "Resource not found", details?: Record<string, unknown>) {
    return new AppError("NOT_FOUND", message, details);
  }

  static invalidStateTransition(message: string, details?: Record<string, unknown>) {
    return new AppError("INVALID_STATE_TRANSITION", message, details);
  }

  static versionConflict(message: string, details?: Record<string, unknown>) {
    return new AppError("VERSION_CONFLICT", message, details);
  }

  static alreadyActioned(message: string, details?: Record<string, unknown>) {
    return new AppError("ALREADY_ACTIONED", message, details);
  }

  static fileTooLarge(message = "File exceeds the configured size limit") {
    return new AppError("FILE_TOO_LARGE", message);
  }

  static rateLimited(message = "Too many requests") {
    return new AppError("RATE_LIMITED", message);
  }

  static internal(message = "An unexpected error occurred") {
    return new AppError("INTERNAL_ERROR", message);
  }
}
