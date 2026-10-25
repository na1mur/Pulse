import type { ErrorBody, ErrorCode } from '@pulse/contract';

/**
 * The one typed error services and transport code throw. The exception filter turns it into the
 * contract's error shape (spec 7.1); anything else becomes INTERNAL.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorBody['details'],
  ) {
    super(message);
    this.name = 'AppError';
  }
}
