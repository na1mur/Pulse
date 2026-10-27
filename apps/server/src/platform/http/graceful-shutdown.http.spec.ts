// Spec 9.2 graceful shutdown: closing the application lets in-flight requests finish, refuses new
// connections, bounds the wait, and closes the database pool.
import { Controller, Get, Inject, type INestApplication } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_LIMITS } from '../config/app-config.js';
import { testConfig } from '../config/config.testing.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from '../database/test-database.testing.js';
import { startTestApp } from './test-app.testing.js';

// The handlers tell the spec when a request has reached them.
let reached: (() => void) | undefined;
const handlerReached = () => new Promise<void>((resolve) => (reached = resolve));

@Controller()
class SlowController {
  constructor(@Inject(DATABASE) private readonly database: Kysely<Database>) {}

  @Get('/test/slow')
  async slow(): Promise<{ finished: true }> {
    reached?.();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { finished: true };
  }

  @Get('/test/stuck')
  stuck(): Promise<never> {
    reached?.();
    return new Promise<never>(() => undefined);
  }

  @Get('/test/db-slow')
  async dbSlow(): Promise<{ ok: true }> {
    reached?.();
    await sql`select pg_sleep(0.3)`.execute(this.database);
    return { ok: true };
  }

  // A request holding a pooled connection in a statement that will not end (a stuck pool).
  @Get('/test/db-stuck')
  async dbStuck(): Promise<{ ok: true }> {
    reached?.();
    await sql`select pg_sleep(60)`.execute(this.database);
    return { ok: true };
  }

  @Get('/test/db')
  async db(): Promise<{ ok: true }> {
    await sql`select 1`.execute(this.database);
    return { ok: true };
  }
}

let app: INestApplication | undefined;
let database: TestDatabase | undefined;

afterEach(async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
  await database?.drop().catch(() => undefined);
  database = undefined;
});

describe('graceful shutdown (spec 9.2)', () => {
  it('lets an in-flight request finish and refuses new connections while it does', async () => {
    const started = await startTestApp({ controllers: [SlowController] });
    app = started.app;
    const arrived = handlerReached();
    const inFlight = fetch(`${started.baseUrl}/test/slow`);
    await arrived;

    const closing = started.app.close();
    // The listener is closed at once: a new request cannot connect any more.
    await expect
      .poll(() =>
        fetch(`${started.baseUrl}/health/live`).then(
          () => 'served',
          () => 'refused',
        ),
      )
      .toBe('refused');

    const response = await inFlight;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ finished: true });
    await closing;
  });

  it('does not wait for idle keep-alive connections', async () => {
    const started = await startTestApp();
    app = started.app;
    await fetch(`${started.baseUrl}/health/live`); // leaves a keep-alive connection open

    const startedAt = Date.now();
    await started.app.close();

    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('cuts a request that is still running after the grace period', async () => {
    const started = await startTestApp({
      controllers: [SlowController],
      config: testConfig({
        limits: { ...DEFAULT_RUNTIME_LIMITS, shutdownGraceMs: 200, shutdownHttpDrainMs: 200 },
      }),
    });
    app = started.app;
    const arrived = handlerReached();
    const stuck = fetch(`${started.baseUrl}/test/stuck`).then(
      () => 'answered',
      () => 'cut',
    );
    await arrived;

    const startedAt = Date.now();
    await started.app.close();

    expect(await stuck).toBe('cut');
    const waited = Date.now() - startedAt;
    expect(waited).toBeGreaterThanOrEqual(150);
    expect(waited).toBeLessThan(3_000);
  });
});

describe.skipIf(databaseTestsSkipped)('graceful shutdown with a real PostgreSQL', () => {
  async function waitUntilSleeping(name: string, adminUrl: string): Promise<void> {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await expect
        .poll(async () => {
          const result = await admin.query(
            "select 1 from pg_stat_activity where datname = $1 and state = 'active' and query like '%pg_sleep(60)%' and pid <> pg_backend_pid()",
            [name],
          );
          return result.rowCount;
        })
        .toBe(1);
    } finally {
      await admin.end();
    }
  }

  async function connectionsTo(name: string, adminUrl: string): Promise<number> {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      const result = await admin.query<{ n: number }>(
        'select count(*)::int as n from pg_stat_activity where datname = $1',
        [name],
      );
      return result.rows[0]?.n ?? -1;
    } finally {
      await admin.end();
    }
  }

  it('closes the database pool: its connections are gone once close() returns', async () => {
    database = await createTestDatabase();
    const url = new URL(database.url);
    const name = url.pathname.slice(1);
    const adminUrl = database.url.replace(url.pathname, '/postgres');
    const started = await startTestApp({
      controllers: [SlowController],
      config: testConfig({ databaseUrl: database.url }),
    });
    app = started.app;
    expect((await fetch(`${started.baseUrl}/test/db`)).status).toBe(200);
    expect(await connectionsTo(name, adminUrl)).toBeGreaterThan(0);

    await started.app.close();

    expect(await connectionsTo(name, adminUrl)).toBe(0);
  });

  it('finishes a request that is querying the database before it closes the pool', async () => {
    database = await createTestDatabase();
    const started = await startTestApp({
      controllers: [SlowController],
      config: testConfig({ databaseUrl: database.url }),
    });
    app = started.app;
    const arrived = handlerReached();
    const inFlight = fetch(`${started.baseUrl}/test/db-slow`);
    await arrived;

    await started.app.close();

    expect((await inFlight).status).toBe(200);
  });

  it('finishes within the one shutdown budget when a request and the pool are both stuck', async () => {
    database = await createTestDatabase();
    const url = new URL(database.url);
    const name = url.pathname.slice(1);
    const adminUrl = database.url.replace(url.pathname, '/postgres');
    // Budget 1000 ms in all: at most 600 ms of it for the drain, the rest for closing the pool.
    // Two separate waits of the full budget each would take about 2000 ms.
    const started = await startTestApp({
      controllers: [SlowController],
      config: testConfig({
        databaseUrl: database.url,
        limits: { ...DEFAULT_RUNTIME_LIMITS, shutdownGraceMs: 1_000, shutdownHttpDrainMs: 600 },
      }),
    });
    app = started.app;
    const arrived = handlerReached();
    const stuck = fetch(`${started.baseUrl}/test/db-stuck`).then(
      () => 'answered',
      () => 'cut',
    );
    await arrived;
    await waitUntilSleeping(name, adminUrl);

    const startedAt = Date.now();
    await started.app.close();
    const elapsed = Date.now() - startedAt;

    expect(await stuck).toBe('cut');
    // It really waited for the drain, and was out of time before a second full wait.
    expect(elapsed).toBeGreaterThanOrEqual(550);
    expect(elapsed).toBeLessThan(1_500);
  });
});
