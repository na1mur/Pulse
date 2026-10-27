import http from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer } from './bootstrap.js';
import { createDatabase } from './platform/database/database.factory.js';
import type { Database } from './platform/database/database.types.js';
import { migrate } from './platform/database/migrator.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from './platform/database/test-database.testing.js';

async function tableExists(db: Kysely<Database>, name: string): Promise<boolean> {
  const result = await sql<{ present: boolean }>`
    select to_regclass(${name}) is not null as present`.execute(db);
  return result.rows[0]?.present === true;
}

describe('startServer', () => {
  let started: INestApplication | undefined;

  beforeEach(() => {
    vi.stubEnv('PORT', '0');
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await started?.close();
    started = undefined;
  });

  it('refuses to start without DATABASE_URL, before creating the application', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const create = vi.spyOn(NestFactory, 'create');

    await expect(startServer()).rejects.toThrow(/DATABASE_URL is required/);
    expect(create).not.toHaveBeenCalled();
  });

  it('names host and port, not the password, when the database is unreachable (QA T1.1 Bug 3)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://pulse:s3cret@127.0.0.1:1/pulse');

    const failure = await startServer().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /^Cannot reach the database at 127\.0\.0\.1:1 \(ECONNREFUSED\)/,
    );
    expect((failure as Error).message).not.toContain('s3cret');
  });

  describe.skipIf(databaseTestsSkipped)('with a real PostgreSQL', () => {
    let database: TestDatabase;
    let inspector: Kysely<Database>;

    beforeAll(async () => {
      database = await createTestDatabase();
      inspector = createDatabase(database.url);
    });
    afterAll(async () => {
      await inspector.destroy();
      await database.drop();
    });
    beforeEach(async () => {
      await migrate(inspector, 'down');
      vi.stubEnv('DATABASE_URL', database.url);
    });

    /**
     * Records the order of "migrations finished" (our log line, written right after the runner
     * returns) and "the HTTP server starts listening".
     */
    function recordOrder(): string[] {
      const events: string[] = [];
      const log = Logger.log.bind(Logger) as (message: unknown, context?: string) => void;
      vi.spyOn(Logger, 'log').mockImplementation((message: unknown, context?: string) => {
        if (context === 'Migrations') events.push('migrations finished');
        log(message, context);
      });
      const listen = Reflect.get(http.Server.prototype, 'listen') as (
        this: http.Server,
        ...args: unknown[]
      ) => http.Server;
      vi.spyOn(http.Server.prototype, 'listen').mockImplementation(function (
        this: http.Server,
        ...args: unknown[]
      ) {
        events.push('listen');
        return listen.apply(this, args);
      } as never);
      return events;
    }

    it('applies the migrations before it listens and then serves requests', async () => {
      const events = recordOrder();

      started = await startServer();

      expect(events).toEqual(['migrations finished', 'listen']);
      expect(await tableExists(inspector, 'users')).toBe(true);
      const response = await fetch(`${await started.getUrl()}/health/live`);
      expect(response.status).toBe(200);
    });

    it('starts again against an up-to-date schema without changing it', async () => {
      started = await startServer();
      await started.close();

      started = await startServer();

      const applied = await sql<{ n: number }>`select count(*) as n from schema_migrations`.execute(
        inspector,
      );
      expect(applied.rows[0]?.n).toBe(1);
    });

    it('does not listen when a migration fails and closes the application', async () => {
      // A migration this version does not know: the runner refuses to touch the schema.
      await migrate(inspector, 'up');
      await sql`insert into schema_migrations (id, name, checksum) values ('9999', 'future', 'x')`.execute(
        inspector,
      );
      const events = recordOrder();

      await expect(startServer()).rejects.toThrow(/9999/);

      expect(events).toEqual([]);
      await sql`delete from schema_migrations where id = '9999'`.execute(inspector);
    });
  });
});
