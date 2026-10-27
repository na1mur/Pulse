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

export interface DatabaseOptions {
  /** How long to wait for a connection from the pool or a new one (spec 9.2). */
  readonly connectTimeoutMs?: number;
  /** PostgreSQL cancels a statement, and ends a transaction left idle, after this long. */
  readonly statementTimeoutMs?: number;
  readonly poolMax?: number;
}

/**
 * A Kysely bound to one PostgreSQL URL. The pool connects on first use, not here. Without options
 * there are no timeouts (tests and tools); the server passes the configured ones.
 */
export function createDatabase(
  connectionUrl: string,
  options: DatabaseOptions = {},
): Kysely<Database> {
  const types = new pg.TypeOverrides();
  types.setTypeParser(pg.types.builtins.INT8, parseInt8);
  const pool = new pg.Pool({
    connectionString: connectionUrl,
    types,
    max: options.poolMax,
    connectionTimeoutMillis: options.connectTimeoutMs,
    statement_timeout: options.statementTimeoutMs,
    idle_in_transaction_session_timeout: options.statementTimeoutMs,
  });
  // node-postgres re-emits an error on an idle pooled client (PostgreSQL restarted, failover, a
  // proxy idle timeout) as an error event on the pool; without a listener it is an uncaught
  // exception that kills the process. The pool drops that client and the next query reconnects.
  // Only the code and message are logged: they never contain the connection string.
  pool.on('error', (error: Error & { code?: string }) => {
    logger.error(`Idle database connection lost (${error.code ?? 'no code'}): ${error.message}`);
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
