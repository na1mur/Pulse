import type { ErrorBody, ErrorCode } from '@pulse/contract';

type ErrorDetails = NonNullable<ErrorBody['details']>;
type FieldError = NonNullable<ErrorDetails['fields']>[number];

export interface AppErrorOptions {
  readonly details?: ErrorDetails;
  /** RATE_LIMITED: sent as the `Retry-After` header, in whole seconds. */
  readonly retryAfterSeconds?: number;
}

/**
 * The one typed error services and transport code throw. The exception filter turns it into the
 * contract's error shape (spec 7.1); anything else becomes INTERNAL.
 */
export class AppError extends Error {
  readonly details: ErrorDetails | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    readonly code: ErrorCode,
    message: string,
    { details, retryAfterSeconds }: AppErrorOptions = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** VALIDATION naming the fields that failed (spec 7.1): the one wording for an invalid request. */
export function invalidRequest(fields: readonly FieldError[]): AppError {
  return new AppError('VALIDATION', 'The request is invalid.', {
    details: { fields: [...fields] },
  });
}
