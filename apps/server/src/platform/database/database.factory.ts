import { Logger } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './database.types.js';

/**
 * Revisions and counts are bigint columns (R-35); the contract types them as integers, and they
 * stay far below 2^53, so they are read as numbers. A value beyond that fails loudly.
 */
function parseInt8(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`bigint ${value} does not fit a JavaScript integer`);
  }
  return parsed;
}

const logger = new Logger('Database');

/** A Kysely bound to one PostgreSQL URL. The pool connects on first use, not here. */
export function createDatabase(connectionUrl: string): Kysely<Database> {
  const types = new pg.TypeOverrides();
  types.setTypeParser(pg.types.builtins.INT8, parseInt8);
  const pool = new pg.Pool({ connectionString: connectionUrl, types });
  // node-postgres re-emits an error on an idle pooled client (PostgreSQL restarted, failover, a
  // proxy idle timeout) as an error event on the pool; without a listener it is an uncaught
  // exception that kills the process. The pool drops that client and the next query reconnects.
  // Only the code and message are logged: they never contain the connection string.
  pool.on('error', (error: Error & { code?: string }) => {
    logger.error(`Idle database connection lost (${error.code ?? 'no code'}): ${error.message}`);
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * A Kysely for a process with no DATABASE_URL (the HTTP specs): building it is free and the first
 * query fails with a clear message. The real server refuses to start without the URL (bootstrap).
 */
export function createUnconfiguredDatabase(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: () => Promise.reject(new Error('DATABASE_URL is not set: no database is configured')),
    }),
  });
}
