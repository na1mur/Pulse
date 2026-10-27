import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { AppConfig } from '../config/app-config.js';
import { installClientErrorHandler } from './client-error.handler.js';
import { RequestContextMiddleware } from './request-context.middleware.js';

const PREFLIGHT_CACHE_SECONDS = 600;
const CONNECTION_CHECK_INTERVAL_MS = 5_000;

/**
 * The HTTP setup that belongs to the process rather than to a module (OPS-03, spec 9.1, 9.2),
 * applied by `startServer` and by every HTTP spec so tests see what production serves:
 *
 * - the request context first, so even a rejected body or an unknown route carries a request ID,
 *   server time and a log context;
 * - the proxy trust (`TRUST_PROXY`), which decides what `request.ip` means;
 * - the CORS allow-list (`CORS_ORIGINS`): exact origins only, none by default; bearer tokens travel
 *   in a header, so no credentials mode;
 * - the Node timeouts that cut slow clients, and the JSON answer for requests Node rejects itself.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.set('trust proxy', config.trustProxy);

  const clock = app.get<Clock>(CLOCK);
  const context = new RequestContextMiddleware(clock);
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
    context.use(request, response, next);
  });

  app.enableCors({
    origin: [...config.corsOrigins],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    // Browser clients read server time to keep their clock offset, and quote the request ID.
    exposedHeaders: [REQUEST_ID_HEADER, SERVER_TIME_HEADER],
    maxAge: PREFLIGHT_CACHE_SECONDS,
  });

  const server = app.getHttpServer();
  installClientErrorHandler(server, clock);
  server.headersTimeout = config.limits.headersTimeoutMs;
  server.requestTimeout = config.limits.requestReceiveTimeoutMs;
  // Node enforces both timeouts when it sweeps its connections, every 30 s by default: a 15 s
  // limit would then hold for up to 45 s. (Documented in Node 18.6+; missing from @types/node.)
  (server as typeof server & { connectionsCheckingInterval: number }).connectionsCheckingInterval =
    Math.min(
      CONNECTION_CHECK_INTERVAL_MS,
      config.limits.headersTimeoutMs,
      config.limits.requestReceiveTimeoutMs,
    );
}
