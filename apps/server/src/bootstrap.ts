import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Kysely } from 'kysely';
import { AppModule } from './app.module.js';
import { describeConnectionFailure } from './platform/database/connection-failure.js';
import { DATABASE } from './platform/database/database.module.js';
import type { Database } from './platform/database/database.types.js';
import { migrate } from './platform/database/migrator.js';

const defaultPort = 3000;

// Validated configuration (spec Appendix A) replaces the two readers below in T1.2; until then
// an invalid or missing value stops the boot instead of being guessed.
function readPort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return defaultPort;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${value}"`);
  }
  return port;
}

function requireDatabaseUrl(value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(
      'DATABASE_URL is required, for example postgres://user:password@host:5432/pulse',
    );
  }
  return value;
}

/**
 * Starts the server: applies pending database migrations, then listens (T1.1). A failed
 * migration stops the boot with the application closed again, so a server never serves requests
 * against a schema it did not bring up to date. Concurrent starts are safe (advisory lock).
 */
export async function startServer(): Promise<INestApplication> {
  const port = readPort(process.env['PORT']);
  const databaseUrl = requireDatabaseUrl(process.env['DATABASE_URL']);

  const app = await NestFactory.create(AppModule);
  try {
    app.enableShutdownHooks();
    const result = await migrate(app.get<Kysely<Database>>(DATABASE), 'up');
    Logger.log(
      result.ids.length === 0
        ? 'Database schema is up to date'
        : `Applied database migrations: ${result.ids.join(', ')}`,
      'Migrations',
    );
    await app.listen(port);
  } catch (error) {
    await app.close();
    throw describeConnectionFailure(error, databaseUrl) ?? error;
  }
  Logger.log(`Pulse server listening on port ${port}`, 'Bootstrap');
  return app;
}
