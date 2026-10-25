import pg from 'pg';
import { summarizeError } from './seed-failure.ts';
import type { Log, SeedContext, SeedDatabase } from './seed-runner.ts';

/** The part of a pg client the adapter uses; a test fake implements it. */
export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ readonly rows: unknown[] }>;
  end(): Promise<void>;
}

/** A connected pg client behind the runner's database port. `close` ends the connection. */
export interface ConnectedSeedDatabase extends SeedDatabase {
  close(): Promise<void>;
}

/**
 * One connection; each `transaction` is BEGIN ... COMMIT, or ROLLBACK when the work throws.
 * Only call this after assertDevTarget accepted the URL (runSeeds does it before using the port,
 * main.ts before connecting).
 */
export async function connectSeedDatabase(
  databaseUrl: string,
  warn: Log,
): Promise<ConnectedSeedDatabase> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  return createSeedDatabase(client, warn);
}

/**
 * `warn` receives secondary problems that must not replace the error being reported: when the
 * rollback fails too (the connection dropped mid-seed), the seed's own error is the one thrown.
 */
export function createSeedDatabase(client: QueryClient, warn: Log): ConnectedSeedDatabase {
  const context: SeedContext = {
    query: async (sql, params) => {
      const result = await client.query(sql, params === undefined ? undefined : [...params]);
      return { rows: result.rows };
    },
  };

  return {
    transaction: async (work) => {
      await client.query('begin');
      try {
        const value = await work(context);
        await client.query('commit');
        return value;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          warn(`rollback also failed: ${summarizeError(rollbackError)}`);
        }
        throw error;
      }
    },
    close: () => client.end(),
  };
}
