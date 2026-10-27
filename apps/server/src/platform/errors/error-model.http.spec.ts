// OPS-03 / spec 7.1, 9.2: every error path leaves the server in the contract's error shape with
// the request ID, over real HTTP: unknown route, wrong method, validation, a client error, an
// unexpected failure, a handler that takes too long, a database outage.
import { Controller, Get, HttpException, type INestApplication } from '@nestjs/common';
import { ErrorBody, REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../config/config.testing.js';
import { DEFAULT_RUNTIME_LIMITS } from '../config/app-config.js';
import { startTestApp } from '../http/test-app.testing.js';
import { AppError } from './app-error.js';

@Controller()
class ProvokingController {
  @Get('/test/slow')
  async slow(): Promise<{ ok: true }> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { ok: true };
  }

  @Get('/test/forbidden')
  forbidden(): never {
    throw new HttpException('nope, user a@b.c', 403);
  }

  @Get('/test/conflict')
  conflict(): never {
    throw new AppError('CONFLICT', 'The name is taken.', {});
  }

  @Get('/test/crash')
  crash(): never {
    throw new Error('connect ECONNREFUSED 10.1.2.3:5432 password=hunter2');
  }

  @Get('/test/crash-async')
  async crashAsync(): Promise<never> {
    await Promise.resolve();
    throw new TypeError('Cannot read properties of undefined (reading hunter2)');
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  ({ app, baseUrl } = await startTestApp({
    controllers: [ProvokingController],
    config: testConfig({ limits: { ...DEFAULT_RUNTIME_LIMITS, requestTimeoutMs: 100 } }),
  }));
});

afterAll(async () => {
  await app.close();
});

async function expectError(response: Response, status: number, code: string): Promise<ErrorBody> {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toMatch(/application\/json/);
  const body = ErrorBody.parse(await response.json());
  expect(body.code).toBe(code);
  expect(body.message.length).toBeGreaterThan(0);
  // The ID in the body is the one in the header, a v4 UUID, and the answer carries server time.
  expect(body.requestId).toBe(response.headers.get(REQUEST_ID_HEADER));
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.headers.get(SERVER_TIME_HEADER)).not.toBeNull();
  return body;
}

describe('every error path has the standard shape (OPS-03, spec 7.1)', () => {
  it('404 for an unknown route', async () => {
    await expectError(await fetch(`${baseUrl}/v1/does/not/exist`), 404, 'NOT_FOUND');
  });

  it('404 for an unknown route with undecodable escapes in the path', async () => {
    await expectError(await fetch(`${baseUrl}/v1/%zz/%E0%A4%A`), 404, 'NOT_FOUND');
  });

  it('404 for a method the route does not have', async () => {
    const response = await fetch(`${baseUrl}/health`, { method: 'DELETE' });
    await expectError(response, 404, 'NOT_FOUND');
  });

  it('400 VALIDATION with the failing field for a bad query', async () => {
    const response = await fetch(`${baseUrl}/v1/app-updates/latest?platform=beos`);
    const body = await expectError(response, 400, 'VALIDATION');
    expect(body.details?.fields?.[0]?.path).toBe('query.platform');
  });

  it('400 VALIDATION for a body that is not JSON, 400 for one that is too large', async () => {
    const headers = { 'content-type': 'application/json' };
    const broken = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'POST',
      headers,
      body: '{"a":',
    });
    await expectError(broken, 400, 'VALIDATION');
    const large = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'x'.repeat(200_000) }),
    });
    await expectError(large, 400, 'VALIDATION');
  });

  it('keeps the contract code of a thrown AppError and maps a Nest HttpException', async () => {
    await expectError(await fetch(`${baseUrl}/test/conflict`), 409, 'CONFLICT');
    const forbidden = await expectError(await fetch(`${baseUrl}/test/forbidden`), 403, 'FORBIDDEN');
    // The framework's own wording (here carrying a made-up address) never reaches the client.
    expect(JSON.stringify(forbidden)).not.toContain('a@b.c');
  });

  it('500 INTERNAL for an unexpected failure, sync or async, without leaking internals', async () => {
    for (const path of ['/test/crash', '/test/crash-async']) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await expectError(response, 500, 'INTERNAL');
      const text = JSON.stringify(body);
      for (const leaked of ['hunter2', 'ECONNREFUSED', '10.1.2.3', 'TypeError', 'at ']) {
        expect(text, `${path} leaked ${leaked}`).not.toContain(leaked);
      }
      expect(body.details).toBeUndefined();
    }
  });

  it('503 UNAVAILABLE for a handler that takes longer than the request timeout', async () => {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/test/slow`);
    await expectError(response, 503, 'UNAVAILABLE');
    // Answered at the limit (100 ms), not when the handler finished (400 ms).
    expect(Date.now() - started).toBeLessThan(350);
  });

  it('answers a request that is within the timeout normally', async () => {
    const response = await fetch(`${baseUrl}/health/live`);
    expect(response.status).toBe(200);
  });
});
