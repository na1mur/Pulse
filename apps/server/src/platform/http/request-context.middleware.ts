import { Injectable, type NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Spec 7.1 and 9.5: every response carries server time and the request ID. Server time is taken
 * when the request reaches us, the instant R-03 stamps online commands with. Returns the request
 * ID; calling it again keeps the first values.
 */
export function ensureRequestContext(response: ServerResponse): string {
  const existing = response.getHeader(REQUEST_ID_HEADER);
  if (typeof existing === 'string') return existing;
  const requestId = randomUUID();
  response.setHeader(REQUEST_ID_HEADER, requestId);
  response.setHeader(SERVER_TIME_HEADER, new Date().toISOString());
  return requestId;
}

/** Express adds X-Powered-By before any middleware runs; the framework is nobody's business. */
export function removeFrameworkHeader(response: ServerResponse): void {
  response.removeHeader('X-Powered-By');
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_request: IncomingMessage, response: ServerResponse, next: () => void): void {
    removeFrameworkHeader(response);
    ensureRequestContext(response);
    next();
  }
}
