import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { formatInstantMillis } from '../../domain/time/index.js';
import { CLOCK, type Clock } from '../clock/clock.js';

/**
 * Spec 7.1 and 9.5: every response carries server time and the request ID. Server time is taken
 * when the request reaches us, the instant R-03 stamps online commands with, from the injected
 * clock (ADR-0004). Returns the request ID; calling it again keeps the first values.
 */
export function ensureRequestContext(response: ServerResponse, clock: Clock): string {
  const existing = response.getHeader(REQUEST_ID_HEADER);
  if (typeof existing === 'string') return existing;
  const requestId = randomUUID();
  response.setHeader(REQUEST_ID_HEADER, requestId);
  response.setHeader(SERVER_TIME_HEADER, formatInstantMillis(clock.now()));
  return requestId;
}

/** Express adds X-Powered-By before any middleware runs; the framework is nobody's business. */
export function removeFrameworkHeader(response: ServerResponse): void {
  response.removeHeader('X-Powered-By');
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  use(_request: IncomingMessage, response: ServerResponse, next: () => void): void {
    removeFrameworkHeader(response);
    ensureRequestContext(response, this.clock);
    next();
  }
}
