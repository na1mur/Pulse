import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ERROR_HTTP_STATUS, type ErrorBody, type ErrorCode } from '@pulse/contract';
import { HttpAdapterHost } from '@nestjs/core';
import type { ServerResponse } from 'node:http';
import { CLOCK, type Clock } from '../clock/clock.js';
import { ensureRequestContext, removeFrameworkHeader } from '../http/request-context.middleware.js';
import { AppError } from './app-error.js';

// Errors raised outside our handlers (routing, body parsing) arrive as Nest HTTP exceptions.
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'VALIDATION',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'VALIDATION',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'UNAVAILABLE',
};

const SAFE_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: 'The request is invalid.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'This is not allowed.',
  NOT_FOUND: 'Not found.',
  CONFLICT: 'The request conflicts with the current state.',
  RATE_LIMITED: 'Too many requests. Try again later.',
  UNAVAILABLE: 'The service is unavailable.',
  INTERNAL: 'Something went wrong.',
};

/**
 * The HTTP status of an error raised outside our handlers: a Nest HttpException (routing, the JSON
 * parse error Nest converts), or an http-errors object from body-parser (body too large,
 * unsupported encoding or charset; QA T0.4 bug 1), which marks client errors with `expose`.
 * Undefined for anything else, which is then INTERNAL.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
}

/** Spec 7.1, ARCHITECTURE 3: every error leaves the server in the contract shape, with its ID. */
@Catch()
export class ContractExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ContractExceptionFilter.name);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ServerResponse>();
    // Body-parser errors arrive before the request-context middleware has run.
    removeFrameworkHeader(response);
    const requestId = ensureRequestContext(response, this.clock);
    const body = this.toBody(exception, requestId);
    if (body.code === 'INTERNAL') {
      // Spec 9.5: the request ID ties the log line to the answer; the cause stays in the log.
      // JavaScript can throw anything, null included; log what was thrown.
      const cause = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`Unhandled error (request ${requestId})`, cause);
    }
    this.adapterHost.httpAdapter.reply(response, body, ERROR_HTTP_STATUS[body.code]);
  }

  private toBody(exception: unknown, requestId: string): ErrorBody {
    if (exception instanceof AppError) {
      const body: ErrorBody = { code: exception.code, message: exception.message, requestId };
      if (exception.details) body.details = exception.details;
      return body;
    }
    const status = clientErrorStatus(exception);
    const code = status === undefined ? 'INTERNAL' : (CODE_BY_STATUS[status] ?? 'INTERNAL');
    // Framework messages ("Cannot GET /x", parser internals) are not part of the contract.
    return { code, message: SAFE_MESSAGES[code], requestId };
  }
}
