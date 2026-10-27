// OPS-01 / T1.2: `/health` runs a real query. Up with a real PostgreSQL, 503 UNAVAILABLE in the
// contract's error shape when the database is unreachable, gone, or does not answer in time.
import { createServer, type Server, type Socket } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ErrorBody, HealthReport, LivenessReport, REQUEST_ID_HEADER } from '@pulse/contract';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_LIMITS } from '../../platform/config/app-config.js';
import { testConfig } from '../../platform/config/config.testing.js';
import { startTestApp } from '../../platform/http/test-app.testing.js';
import { JsonLogger } from '../../platform/logging/json-logger.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from '../../platform/database/test-database.testing.js';

let app: INestApplication | undefined;
let database: TestDatabase | undefined;
let silentServer: Server | undefined;
const silentSockets: Socket[] = [];

afterEach(async () => {
  // Cut the silent database first, or closing the pool waits for its pending connection.
  silentSockets.splice(0).forEach((socket) => socket.destroy());
  await app?.close();
  app = undefined;
  await database?.drop().catch(() => undefined);
  database = undefined;
  await new Promise((resolve) => {
    if (silentServer) silentServer.close(resolve);
    else resolve(undefined);
  });
  silentServer = undefined;
});

async function expectUnavailable(response: Response): Promise<ErrorBody> {
  expect(response.status).toBe(503);
  const body = ErrorBody.parse(await response.json());
  expect(body.code).toBe('UNAVAILABLE');
  expect(body.requestId).toBe(response.headers.get(REQUEST_ID_HEADER));
  return body;
}

describe.skipIf(databaseTestsSkipped)('health.get with a real PostgreSQL', () => {
  it('reports API and database as up', async () => {
    database = await createTestDatabase();
    const started = await startTestApp({ config: testConfig({ databaseUrl: database.url }) });
    app = started.app;

    const response = await fetch(`${started.baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(HealthReport.parse(await response.json())).toEqual({ status: 'ok', database: 'up' });
  });

  it('turns to 503 UNAVAILABLE when the database disappears, and recovers when it is back', async () => {
    database = await createTestDatabase();
    const started = await startTestApp({ config: testConfig({ databaseUrl: database.url }) });
    app = started.app;
    expect((await fetch(`${started.baseUrl}/health`)).status).toBe(200);

    // Drop the database under the running server: its pooled connection is terminated too.
    const target = new URL(database.url);
    const admin = new pg.Client({
      connectionString: database.url.replace(target.pathname, '/postgres'),
    });
    await admin.connect();
    await admin.query(`drop database ${target.pathname.slice(1)} with (force)`);
    await admin.end();

    await expectUnavailable(await fetch(`${started.baseUrl}/health`));
    // The process itself is alive: liveness never looks at the database.
    const live = await fetch(`${started.baseUrl}/health/live`);
    expect(LivenessReport.parse(await live.json())).toEqual({ status: 'ok' });
  });
});

describe('health.get without a usable database', () => {
  it('answers 503 UNAVAILABLE when nothing listens, without naming the host, user or password', async () => {
    const lines: string[] = [];
    const started = await startTestApp({
      config: testConfig({ databaseUrl: 'postgres://pulse:s3cretpw@127.0.0.1:1/pulse' }),
      logger: new JsonLogger((_level, line) => lines.push(line)),
    });
    app = started.app;

    const body = await expectUnavailable(await fetch(`${started.baseUrl}/health`));

    expect(JSON.stringify(body)).not.toMatch(/127\.0\.0\.1|s3cretpw|pulse:|ECONNREFUSED/);
    // The cause is in the log, by code, and the log has no secret either.
    const warning = lines.find((line) => line.includes('Database health check failed'));
    expect(warning).toContain('ECONNREFUSED');
    expect(lines.join('\n')).not.toContain('s3cretpw');
  });

  it('answers 503 within the health timeout when the database accepts but never answers', async () => {
    silentServer = createServer((socket) => silentSockets.push(socket)); // takes the connection, says nothing
    await new Promise<void>((resolve) => silentServer?.listen(0, '127.0.0.1', resolve));
    const { port } = silentServer.address() as { port: number };
    const started = await startTestApp({
      config: testConfig({
        databaseUrl: `postgres://pulse:pulse@127.0.0.1:${port}/pulse`,
        limits: { ...DEFAULT_RUNTIME_LIMITS, healthTimeoutMs: 150 },
      }),
    });
    app = started.app;

    const startedAt = Date.now();
    await expectUnavailable(await fetch(`${started.baseUrl}/health`));

    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
