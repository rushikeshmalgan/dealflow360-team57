export type ServiceErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_CONFLICT"
  | "INTERNAL_ERROR";

const statusByCode: Record<ServiceErrorCode, number> = {
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFIGURATION_CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class ServiceError extends Error {
  readonly status: number;

  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
    this.status = statusByCode[code];
  }
}
