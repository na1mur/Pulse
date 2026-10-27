import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { formatInstantMillis } from '../../domain/time/index.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { runWithLogContext, type LogContext } from '../logging/log-context.js';

/**
 * Spec 7.1 and 9.5: every response carries server time and the request ID. Server time is taken
 * when the request reaches us, the instant R-03 stamps online commands with, from the injected
 * clock (ADR-0004). Returns the request ID; calling it again keeps the first values.
 */
export function ensureRequestContext(response: ServerResponse, clock: Clock): string {
  const existing = response.getHeader(REQUEST_ID_HEADER);
  if (typeof existing === 'string') return existing;
  const { requestId, serverTime } = createRequestStamp(clock);
  response.setHeader(REQUEST_ID_HEADER, requestId);
  response.setHeader(SERVER_TIME_HEADER, serverTime);
  return requestId;
}

/** A fresh request ID and the server time, for answers written without a ServerResponse. */
export function createRequestStamp(clock: Clock): { requestId: string; serverTime: string } {
  return { requestId: randomUUID(), serverTime: formatInstantMillis(clock.now()) };
}

/** Express adds X-Powered-By before any middleware runs; the framework is nobody's business. */
export function removeFrameworkHeader(response: ServerResponse): void {
  response.removeHeader('X-Powered-By');
}

/** The matched route pattern (`/v1/tags/:id`), never the URL: paths and queries can hold IDs. */
function routeOf(request: IncomingMessage): string {
  const { route } = request as IncomingMessage & { route?: { path?: unknown } };
  return typeof route?.path === 'string' ? route.path : 'unmatched';
}

function pathOf(request: IncomingMessage): string {
  return (request.url ?? '').split('?')[0] ?? '';
}

/**
 * Gives every request its ID and log context, and writes one access line when it ends (OPS-04):
 * method, matched route, status and duration, plus the request and user ID the logger adds. No
 * URL, query, header or body is logged. Successful health checks are left out: a probe every few
 * seconds would bury everything else.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Http');

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  use(request: IncomingMessage, response: ServerResponse, next: () => void): void {
    removeFrameworkHeader(response);
    const context: LogContext = { requestId: ensureRequestContext(response, this.clock) };
    const startedAt = performance.now();
    // `close` also fires for a client that went away before the answer was written.
    response.once('close', () => {
      runWithLogContext(context, () => {
        this.logAccess(request, response, startedAt);
      });
    });
    runWithLogContext(context, () => {
      next();
    });
  }

  private logAccess(request: IncomingMessage, response: ServerResponse, startedAt: number): void {
    const completed = response.writableFinished;
    const status = response.statusCode;
    if (completed && status < 400 && pathOf(request).startsWith('/health')) return;
    const entry = {
      message: completed ? 'request' : 'request aborted by the client',
      method: request.method ?? '',
      route: routeOf(request),
      status: completed ? status : 0,
      durationMs: Math.round(performance.now() - startedAt),
    };
    if (completed && status >= 500) this.logger.warn(entry);
    else this.logger.log(entry);
  }
}
