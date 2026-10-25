// HTTP behaviour of the server stub against the contract: error shape, request IDs, server time,
// contract-driven validation and the stubbed operations.
import { Controller, Get, Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ErrorBody,
  HealthReport,
  LivenessReport,
  REQUEST_ID_HEADER,
  SERVER_TIME_HEADER,
} from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.js';

@Controller()
class FailingController {
  @Get('/test/fail')
  fail(): never {
    throw new Error('database password is hunter2');
  }

  // JavaScript can throw anything; the filter must not assume an Error.
  @Get('/test/fail-null')
  failWithNull(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test
    throw null;
  }

  @Get('/test/fail-string')
  failWithString(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test
    throw 'database password is hunter2';
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [FailingController],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

async function errorOf(response: Response) {
  const body = ErrorBody.parse(await response.json());
  expect(body.requestId).toBe(response.headers.get(REQUEST_ID_HEADER));
  return body;
}

describe('every response (spec 7.1)', () => {
  it('carries server time and a request ID', async () => {
    const before = Date.now();
    const response = await fetch(`${baseUrl}/health/live`);
    const serverTime = response.headers.get(SERVER_TIME_HEADER) ?? '';
    expect(serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(serverTime)).toBeGreaterThanOrEqual(before - 1000);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not advertise the framework (QA T0.4 L4)', async () => {
    const ok = await fetch(`${baseUrl}/health/live`);
    const error = await fetch(`${baseUrl}/v1/nothing-here`);
    expect([ok.headers.get('x-powered-by'), error.headers.get('x-powered-by')]).toEqual([
      null,
      null,
    ]);
  });

  it('carries them on errors too', async () => {
    const response = await fetch(`${baseUrl}/v1/nothing-here`);
    expect(response.headers.get(SERVER_TIME_HEADER)).not.toBeNull();
    await errorOf(response);
  });
});

describe('health (health.get, health.live)', () => {
  it('reports API and database status per the contract', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(HealthReport.parse(await response.json())).toEqual({ status: 'ok', database: 'up' });
  });

  it('answers liveness', async () => {
    const response = await fetch(`${baseUrl}/health/live`);
    expect(response.status).toBe(200);
    expect(LivenessReport.parse(await response.json())).toEqual({ status: 'ok' });
  });
});

describe('contract-driven validation (appUpdates.getLatest stub)', () => {
  it('returns VALIDATION in the error shape, naming the field', async () => {
    const response = await fetch(`${baseUrl}/v1/app-updates/latest?platform=linux`);
    expect(response.status).toBe(400);
    const body = await errorOf(response);
    expect(body.code).toBe('VALIDATION');
    expect(body.details?.fields?.map((field) => field.path)).toEqual(['query.platform']);
  });

  it('rejects a missing field and an unknown field (spec 9.1)', async () => {
    const missing = await fetch(`${baseUrl}/v1/app-updates/latest`);
    expect((await errorOf(missing)).code).toBe('VALIDATION');
    const unknown = await fetch(`${baseUrl}/v1/app-updates/latest?platform=android&debug=1`);
    expect((await errorOf(unknown)).code).toBe('VALIDATION');
  });

  it('reaches the handler with a valid request: no release is published yet, so NOT_FOUND', async () => {
    const response = await fetch(`${baseUrl}/v1/app-updates/latest?platform=android`);
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe('NOT_FOUND');
  });
});

describe('errors outside handlers', () => {
  it('answers an unknown route with NOT_FOUND in the same shape', async () => {
    const response = await fetch(`${baseUrl}/v1/stats/today`);
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe('NOT_FOUND');
  });

  it('answers a body that is not JSON with VALIDATION', async () => {
    const response = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"commandId":',
    });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('VALIDATION');
  });

  it('answers an unexpected failure with INTERNAL and does not leak its message', async () => {
    const response = await fetch(`${baseUrl}/test/fail`);
    expect(response.status).toBe(500);
    const body = await errorOf(response);
    expect(body.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('answers INTERNAL and logs the thrown value when something other than an Error is thrown', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      for (const [path, thrown] of [
        ['/test/fail-null', 'null'],
        ['/test/fail-string', 'database password is hunter2'],
      ] as const) {
        logged.mockClear();
        const response = await fetch(`${baseUrl}${path}`);
        expect(response.status, path).toBe(500);
        const body = await errorOf(response);
        expect(body.code, path).toBe('INTERNAL');
        expect(JSON.stringify(body), path).not.toContain('hunter2');
        // One log line with the real cause, not a TypeError from the filter itself.
        expect(logged, path).toHaveBeenCalledTimes(1);
        expect(logged.mock.calls[0]?.[1], path).toBe(thrown);
      }
    } finally {
      logged.mockRestore();
    }
  });

  it('logs only unexpected failures as unhandled, not client errors (QA T0.4 bug 1)', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await fetch(`${baseUrl}/v1/timer/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(200_000) }),
      });
      expect(logged).not.toHaveBeenCalled();
      await fetch(`${baseUrl}/test/fail`);
      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
  });
});
