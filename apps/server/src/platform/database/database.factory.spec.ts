import { Logger } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from './database.factory.js';
import type { Database } from './database.types.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from './test-database.testing.js';

describe.skipIf(databaseTestsSkipped)('createDatabase (real PostgreSQL)', () => {
  let database: TestDatabase;
  let db: Kysely<Database>;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = createDatabase(database.url);
  });
  afterAll(async () => {
    await db.destroy();
    await database.drop();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads bigint columns as numbers', async () => {
    const result = await sql<{ n: number }>`select count(*) as n from pg_class`.execute(db);
    expect(typeof result.rows[0]?.n).toBe('number');
  });

  it('survives PostgreSQL closing an idle pooled connection: it logs and reconnects (QA T1.1 Bug 2)', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await sql`select 1`.execute(db); // leaves one idle client in the pool

    // Another connection kills every backend of this database except itself, like a restart.
    const killer = createDatabase(database.url);
    try {
      await sql`select pg_terminate_backend(pid) from pg_stat_activity
        where datname = current_database() and pid <> pg_backend_pid()`.execute(killer);
    } finally {
      await killer.destroy();
    }

    // The pool reports the lost idle client; an unhandled error event would crash the process
    // (vitest reports it as an unhandled error and fails the run).
    await vi.waitFor(() => {
      expect(logged).toHaveBeenCalledWith(
        expect.stringMatching(/^Idle database connection lost \(57P01\): terminating connection/),
      );
    });
    expect(String(logged.mock.calls[0]?.[0])).not.toContain(database.url);

    const result = await sql<{ one: number }>`select 1 as one`.execute(db);
    expect(result.rows).toEqual([{ one: 1 }]);
  });
});
