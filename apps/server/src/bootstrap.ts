import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Kysely } from 'kysely';
import { AppModule } from './app.module.js';
import { ConfigError, loadConfig } from './platform/config/load-config.js';
import {
  DatabaseUnreachableError,
  describeConnectionFailure,
} from './platform/database/connection-failure.js';
import { DATABASE } from './platform/database/database.module.js';
import type { Database } from './platform/database/database.types.js';
import { migrate, MigrationError } from './platform/database/migrator.js';
import { configureApp } from './platform/http/configure-app.js';
import { JsonLogger } from './platform/logging/json-logger.js';
import { stackFrames, summarizeError } from './platform/logging/safe-error.js';

/**
 * Starts the server: validates the configuration (OPS-03), applies pending database migrations,
 * then listens (T1.1). An invalid configuration stops the boot before anything else is created.
 * A failed migration stops it with the application closed again, so a server never serves
 * requests against a schema it did not bring up to date. Concurrent starts are safe (advisory
 * lock). SIGTERM and SIGINT close the application: the HTTP server drains within the grace
 * period, then the database pool closes (spec 9.2).
 */
export async function startServer(): Promise<INestApplication> {
  const config = loadConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLogger(),
  });
  try {
    configureApp(app, config);
    app.enableShutdownHooks();
    const result = await migrate(app.get<Kysely<Database>>(DATABASE), 'up');
    Logger.log(
      result.ids.length === 0
        ? 'Database schema is up to date'
        : `Applied database migrations: ${result.ids.join(', ')}`,
      'Migrations',
    );
    await app.listen(config.port);
  } catch (error) {
    await app.close();
    throw describeConnectionFailure(error, config.databaseUrl) ?? error;
  }
  Logger.log(`Pulse server listening on port ${config.port}`, 'Bootstrap');
  return app;
}

// Failures whose message the server words itself (no driver text, no credentials, no user data).
function hasOperatorMessage(error: unknown): error is Error {
  return (
    error instanceof ConfigError ||
    error instanceof MigrationError ||
    error instanceof DatabaseUnreachableError
  );
}

/**
 * What `main` prints when the server cannot start (OPS-04: logs and output carry no personal
 * data). A configuration, migration or unreachable-database error is worded by us, so its message
 * is printed (a configuration error without a stack, every problem listed); anything else is
 * printed by class, code and stack frames only, because a driver or validation message can
 * embed values.
 */
export function describeStartupFailure(error: unknown): string {
  if (error instanceof ConfigError) return error.message;
  if (hasOperatorMessage(error)) return `Pulse server failed to start: ${error.message}`;
  const frames = error instanceof Error ? stackFrames(error.stack) : '';
  const summary = `Pulse server failed to start: ${summarizeError(error)}`;
  return frames ? `${summary}\n${frames}` : summary;
}
