// Test support (not built into dist, see tsconfig.build.json): one throwaway PostgreSQL database
// per test file, created on the server named by PULSE_TEST_DATABASE_URL and dropped afterwards.
// Nothing here touches the dev `pulse` database or any other existing database.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { Kysely } from 'kysely';
import { createDatabase } from './database.factory.js';
import type { Database } from './database.types.js';

/** The administrative connection used only to CREATE and DROP throwaway databases. */
const defaultAdminUrl = 'postgres://pulse:pulse@localhost:5432/postgres';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * PULSE_SKIP_DB_TESTS=1 is the explicit opt-out for machines with no PostgreSQL: the database
 * tests are reported as skipped, never silently passed. Without it an unreachable server fails.
 */
export const databaseTestsSkipped = process.env['PULSE_SKIP_DB_TESTS'] === '1';

if (databaseTestsSkipped) {
  process.stderr.write(
    'WARNING: PULSE_SKIP_DB_TESTS=1, the PostgreSQL integration tests are skipped. ' +
      'Run them with `pnpm dev:up` before committing.\n',
  );
}

export interface TestDatabase {
  readonly url: string;
  readonly db: Kysely<Database>;
  /** Closes the pool and drops the database. */
  drop(): Promise<void>;
}

function adminUrl(): URL {
  const url = new URL(process.env['PULSE_TEST_DATABASE_URL'] ?? defaultAdminUrl);
  if (!loopbackHosts.has(url.hostname)) {
    throw new Error(
      `PULSE_TEST_DATABASE_URL must point at a local PostgreSQL (localhost), got host "${url.hostname}": ` +
        'the tests create and drop databases on it.',
    );
  }
  return url;
}

function describeUnreachable(url: URL, error: unknown): Error {
  const { code } = error as { code?: string };
  const cause = code ?? (error instanceof Error ? error.message : String(error));
  return new Error(
    `PostgreSQL is not reachable at ${url.hostname}:${url.port || '5432'} (${cause}). ` +
      'The integration tests need a real PostgreSQL: run `pnpm dev:up` and, when the database ' +
      'port is not 5432, set PULSE_TEST_DATABASE_URL (for example ' +
      'postgres://pulse:pulse@localhost:15432/postgres). To skip them knowingly set PULSE_SKIP_DB_TESTS=1.',
    { cause: error },
  );
}

/** Creates an empty database named `pulse_test_<random>` and returns a Kysely bound to it. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const admin = adminUrl();
  const name = `pulse_test_${randomBytes(6).toString('hex')}`;
  const adminClient = new pg.Client({ connectionString: admin.href });
  try {
    await adminClient.connect();
  } catch (error) {
    throw describeUnreachable(admin, error);
  }
  try {
    await adminClient.query(`create database ${name}`);
  } finally {
    await adminClient.end();
  }

  const target = new URL(admin.href);
  target.pathname = `/${name}`;
  const db = createDatabase(target.href);
  return {
    url: target.href,
    db,
    drop: async () => {
      await db.destroy();
      const client = new pg.Client({ connectionString: admin.href });
      await client.connect();
      try {
        await client.query(`drop database if exists ${name} with (force)`);
      } finally {
        await client.end();
      }
    },
  };
}
