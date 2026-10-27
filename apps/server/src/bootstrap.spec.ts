import http from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeStartupFailure, startServer } from './bootstrap.js';
import { ConfigError, loadConfig } from './platform/config/load-config.js';
import { testEnv } from './platform/config/config.testing.js';
import { describeConnectionFailure } from './platform/database/connection-failure.js';
import { createDatabase } from './platform/database/database.factory.js';
import type { Database } from './platform/database/database.types.js';
import { migrate, MigrationError } from './platform/database/migrator.js';
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
    vi.stubEnv('JWT_SECRET', testEnv()['JWT_SECRET'] ?? '');
    vi.stubEnv('REFRESH_SECRET', testEnv()['REFRESH_SECRET'] ?? '');
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await started?.close();
    started = undefined;
  });

  it('OPS-03: refuses bad configuration with every problem listed, before creating the application', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('PORT', 'abc');
    vi.stubEnv('JWT_SECRET', 'changeme');
    vi.stubEnv('CORS_ORIGINS', '*');
    const create = vi.spyOn(NestFactory, 'create');

    const failure = await startServer().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConfigError);
    expect((failure as ConfigError).problems.map((problem) => problem.split(' ')[0])).toEqual([
      'PORT',
      'DATABASE_URL',
      'JWT_SECRET',
      'CORS_ORIGINS',
    ]);
    expect((failure as Error).message).not.toContain('changeme');
    expect(create).not.toHaveBeenCalled();
  });

  it('OPS-03: prints a configuration error as its message alone, and keeps the stack of other failures', () => {
    let configError: unknown;
    try {
      loadConfig({});
    } catch (error) {
      configError = error;
    }
    const printed = describeStartupFailure(configError);
    expect(printed).toMatch(/^Invalid configuration \(3 problems\):/);
    expect(printed).not.toContain('    at ');
  });

  it('OPS-04: prints an unexpected startup failure by class, code and frames, never its message', () => {
    const driver = Object.assign(new Error('invalid input syntax: "a.person@example.org"'), {
      code: '22P02',
    });
    const printed = describeStartupFailure(driver);
    expect(printed).toMatch(/^Pulse server failed to start: Error \[22P02\]\n\s+at /);
    expect(printed).not.toContain('example.org');
    expect(describeStartupFailure('a.person@example.org')).toBe(
      'Pulse server failed to start: a thrown string',
    );
  });

  it('keeps the message of the failures the server words itself and that hold no value', () => {
    const migrationFailure = new MigrationError(
      'the database has migration 9999, which is unknown',
    );
    expect(describeStartupFailure(migrationFailure)).toBe(
      `Pulse server failed to start: ${migrationFailure.message}`,
    );
    const unreachable = describeConnectionFailure(
      Object.assign(new Error(''), { code: 'ECONNREFUSED' }),
      'postgres://pulse:s3cret@db.internal:5432/pulse',
    );
    const printed = describeStartupFailure(unreachable);
    expect(printed).toContain('Cannot reach the database at db.internal:5432 (ECONNREFUSED)');
    expect(printed).not.toContain('s3cret');
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
