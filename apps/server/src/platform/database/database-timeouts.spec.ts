// Spec 9.2, database connection timeouts: a statement that runs too long is cancelled by
// PostgreSQL, a database that does not answer the connection fails fast, and migrations are not
// subject to the request-oriented statement timeout.
import { createServer, type Socket } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.factory.js';
import type { Database } from './database.types.js';
import { migrate } from './migrator.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from './test-database.testing.js';

describe('createDatabase connect timeout', () => {
  it('fails within the connect timeout when the server accepts the connection and never answers', async () => {
    const sockets: Socket[] = [];
    const silent = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const { port } = silent.address() as { port: number };
    const db = createDatabase(`postgres://pulse:pulse@127.0.0.1:${port}/pulse`, {
      connectTimeoutMs: 200,
    });
    try {
      const startedAt = Date.now();
      await expect(sql`select 1`.execute(db)).rejects.toThrow(/timeout/i);
      expect(Date.now() - startedAt).toBeLessThan(2_000);
    } finally {
      sockets.forEach((socket) => socket.destroy());
      await db.destroy();
      await new Promise((resolve) => silent.close(resolve));
    }
  });
});

describe.skipIf(databaseTestsSkipped)('createDatabase statement timeout (real PostgreSQL)', () => {
  let database: TestDatabase;
  let db: Kysely<Database>;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = createDatabase(database.url, { statementTimeoutMs: 150, poolMax: 2 });
  });
  afterAll(async () => {
    await db.destroy();
    await database.drop();
  });

  it('cancels a statement that runs longer than the timeout and stays usable', async () => {
    const startedAt = Date.now();
    await expect(sql`select pg_sleep(5)`.execute(db)).rejects.toMatchObject({ code: '57014' });
    expect(Date.now() - startedAt).toBeLessThan(2_000);

    const result = await sql<{ one: number }>`select 1 as one`.execute(db);
    expect(result.rows).toEqual([{ one: 1 }]);
  });

  it('runs a migration longer than the statement timeout, and only that', async () => {
    await migrate(db, 'up', {
      migrations: [
        {
          id: '0001',
          name: 'slow',
          up: 'select pg_sleep(0.5); create table slow_table (id int primary key);',
          down: 'drop table slow_table;',
        },
      ],
    });
    const created = await sql<{ present: boolean }>`
      select to_regclass('slow_table') is not null as present`.execute(db);
    expect(created.rows[0]?.present).toBe(true);

    // The exemption was local to the migration transaction: ordinary statements still time out.
    await expect(sql`select pg_sleep(5)`.execute(db)).rejects.toMatchObject({ code: '57014' });
  });
});
