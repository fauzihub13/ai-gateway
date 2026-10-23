export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    public type: string = 'invalid_request_error',
    message?: string,
    public param: string | null = null,
    public retryable = false,
    public internal?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(code = 'invalid_request_error', message?: string, param: string | null = null) {
    super(code, 400, 'invalid_request_error', message, param);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'invalid_api_key', message = 'Incorrect API key provided.') {
    super(code, 401, 'invalid_request_error', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = 'model_not_allowed', message?: string) {
    super(code, 403, 'permission_error', message ?? code);
  }
}

export class NotFoundError extends AppError {
  constructor(code = 'model_not_found', message?: string) {
    super(code, 404, 'invalid_request_error', message ?? code);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient balance to process this request.') {
    super('insufficient_balance', 402, 'insufficient_quota', message);
  }
}

/** Plan lewat masa aktif (`planExpiresAt <= now`). Request ditolak sampai beli lagi. */
export class PlanExpiredError extends AppError {
  constructor(message = 'Your plan has expired. Purchase a plan to continue.') {
    super('plan_expired', 402, 'insufficient_quota', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(code = 'rate_limit_exceeded', message = 'Rate limit exceeded. Please retry later.') {
    super(code, 429, code === 'quota_exceeded' || code === 'key_quota_exceeded' ? 'insufficient_quota' : 'rate_limit_error', message, null, true);
  }
}

export class UpstreamUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable. Please retry.') {
    super('upstream_unavailable', 503, 'api_error', message, null, true);
  }
}

export class UpstreamTimeoutError extends AppError {
  constructor(message = 'Upstream request timed out. Please retry.') {
    super('upstream_timeout', 504, 'api_error', message, null, true);
  }
}

export class UpstreamError extends AppError {
  constructor(code = 'upstream_error', message = 'The request could not be processed by the provider.') {
    super(code, 502, 'api_error', message, null, false);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error.') {
    super('internal_error', 500, 'api_error', message, null, true);
  }
}

export function redact(input: string): string {
  return input
    .replace(/sk-[a-z]+-[A-Za-z0-9]{10,}/gi, 'sk-***REDACTED***')
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer ***REDACTED***');
}

export function toErrorResponse(err: unknown, requestId: string): Response {
  const e = err instanceof AppError ? err : new InternalError();

  if (!(err instanceof AppError)) {
    console.error(redact(String(err)), { requestId });
  }

  return Response.json(
    { error: { message: e.message, type: e.type, code: e.code, param: e.param } },
    { status: e.httpStatus, headers: { 'x-request-id': requestId } },
  );
}

export function isRetryable(status: number, code: string): boolean {
  if ([500, 502, 503, 504, 429].includes(status)) return true;
  return ['rate_limit_exceeded', 'upstream_unavailable', 'upstream_timeout', 'internal_error'].includes(code);
}