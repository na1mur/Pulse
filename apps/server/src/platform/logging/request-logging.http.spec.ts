// OPS-04: structured logs with request IDs and user IDs only, over real HTTP: what one request
// writes, and everything it must not write.
import { Controller, Get, Logger, Post, type INestApplication } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@pulse/contract';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../http/test-app.testing.js';
import { JsonLogger } from './json-logger.js';
import { setLogUser } from './log-context.js';

const USER_ID = '0192f0c0-0000-7000-8000-000000000001';

@Controller()
class LoggingController {
  private readonly logger = new Logger('Probe');

  @Get('/test/signed-in')
  signedIn(): { ok: true } {
    this.logger.log('before the user is known');
    setLogUser(USER_ID);
    this.logger.log('after the user is known');
    return { ok: true };
  }

  @Get('/test/crash')
  crash(): never {
    throw new Error('boom');
  }

  // A driver error: its message quotes the value that failed (here an email address).
  @Get('/test/crash-with-value')
  crashWithValue(): never {
    throw Object.assign(new Error('invalid input syntax for type uuid: "a.person@example.org"'), {
      code: '22P02',
    });
  }

  @Get('/test/throw-value')
  throwValue(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test
    throw 'a.person@example.org';
  }

  @Post('/test/echo')
  echo(): { ok: true } {
    return { ok: true };
  }
}

const lines: Record<string, unknown>[] = [];
const rawLines: string[] = [];
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const logger = new JsonLogger((_level, raw) => {
    rawLines.push(raw);
    lines.push(JSON.parse(raw) as Record<string, unknown>);
  });
  ({ app, baseUrl } = await startTestApp({ controllers: [LoggingController], logger }));
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  lines.length = 0;
  rawLines.length = 0;
});

/** The access line is written when the response closes, a moment after the client has it. */
async function accessLine(route: string): Promise<Record<string, unknown>> {
  let found: Record<string, unknown> | undefined;
  await expect
    .poll(() => {
      found = lines.find((line) => line['context'] === 'Http' && line['route'] === route);
      return found;
    })
    .toBeDefined();
  return found ?? {};
}

describe('OPS-04: one access line per request', () => {
  it('carries the request ID of the response, the route, status and duration', async () => {
    const response = await fetch(`${baseUrl}/test/signed-in`);
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    const line = await accessLine('/test/signed-in');
    expect(line).toMatchObject({
      level: 'log',
      message: 'request',
      method: 'GET',
      route: '/test/signed-in',
      status: 200,
      requestId,
    });
    expect(line['durationMs']).toBeTypeOf('number');
  });

  it('puts the user ID on the lines written after the user is known, and no other person data', async () => {
    const response = await fetch(`${baseUrl}/test/signed-in`);
    const requestId = response.headers.get(REQUEST_ID_HEADER);
    await accessLine('/test/signed-in');

    const probes = lines.filter((line) => line['context'] === 'Probe');
    expect(probes.map((line) => line['userId'])).toEqual([undefined, USER_ID]);
    expect(probes.every((line) => line['requestId'] === requestId)).toBe(true);
    // The access line is written after the handler set the user.
    expect((await accessLine('/test/signed-in'))['userId']).toBe(USER_ID);
    // Every line's keys are from this list: nothing carries a header, body, IP or token field.
    const allowed = new Set([
      'time',
      'level',
      'context',
      'message',
      'requestId',
      'userId',
      'method',
      'route',
      'status',
      'durationMs',
      'stack',
    ]);
    for (const line of lines) {
      expect(Object.keys(line).filter((key) => !allowed.has(key))).toEqual([]);
    }
  });

  it('keeps the URL, query, headers and body out of every line', async () => {
    const secrets = ['tok-0123456789', 'a.person@example.org', 'hunter2', 'Mozilla/5.0 Secret'];
    await fetch(`${baseUrl}/test/signed-in?token=${secrets[0]}&email=${secrets[1]}`, {
      headers: {
        authorization: `Bearer ${secrets[0]}`,
        cookie: 'session=hunter2',
        'user-agent': secrets[3] ?? '',
      },
    });
    await fetch(`${baseUrl}/test/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: secrets[1], password: secrets[2] }),
    });
    await fetch(`${baseUrl}/v1/some/${secrets[0]}/path?x=${secrets[1]}`);
    await accessLine('unmatched');

    expect(rawLines.length).toBeGreaterThan(2);
    const everything = rawLines.join('\n');
    for (const secret of secrets) expect(everything).not.toContain(secret);
  });

  it('logs an unknown route as "unmatched", never its path', async () => {
    await fetch(`${baseUrl}/v1/users/someone@example.org`);
    const line = await accessLine('unmatched');
    expect(line).toMatchObject({ method: 'GET', status: 404 });
  });

  it('logs an unhandled error once with its request ID and the stack, and the answer without it', async () => {
    const response = await fetch(`${baseUrl}/test/crash`);
    const requestId = response.headers.get(REQUEST_ID_HEADER);
    expect(await response.text()).not.toContain('boom');
    await accessLine('/test/crash');

    const errors = lines.filter((line) => line['level'] === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ requestId, context: 'ContractExceptionFilter' });
    expect(errors[0]?.['stack']).toContain('LoggingController.crash');
    expect(errors[0]?.['message']).toBe('Unhandled error: Error');
    expect(JSON.stringify(errors[0])).not.toContain('boom');
    // The access line of a 500 is a warning, so a level filter finds it.
    const access = lines.find((line) => line['route'] === '/test/crash');
    expect(access).toMatchObject({ level: 'warn', status: 500, requestId });
  });

  it('keeps a value quoted by an error out of the log and the answer, logging class, code and frames (OPS-04)', async () => {
    const everything: string[] = [];
    for (const path of ['/test/crash-with-value', '/test/throw-value']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(500);
      everything.push(await response.text());
      await accessLine(path);
    }
    expect(lines.filter((line) => line['level'] === 'error')).toHaveLength(2);
    const [driver, thrown] = lines.filter((line) => line['level'] === 'error');
    expect(driver).toMatchObject({
      message: 'Unhandled error: Error [22P02]',
      context: 'ContractExceptionFilter',
    });
    expect(driver?.['stack']).toContain('at ');
    expect(thrown?.['message']).toBe('Unhandled error: a thrown string');
    everything.push(...rawLines);
    expect(everything.join('\n')).not.toContain('example.org');
  });

  it('does not log successful health checks, but does log a failing one', async () => {
    await fetch(`${baseUrl}/health/live`);
    await fetch(`${baseUrl}/test/echo`, { method: 'POST' });
    await accessLine('/test/echo');
    expect(lines.filter((line) => String(line['route']).startsWith('/health'))).toEqual([]);

    // The test database is unreachable, so /health answers 503 and that is worth a line.
    await fetch(`${baseUrl}/health`);
    expect((await accessLine('/health'))['status']).toBe(503);
  });

  it('gives every request its own ID', async () => {
    const ids = new Set<string | null>();
    for (let i = 0; i < 5; i += 1) {
      ids.add((await fetch(`${baseUrl}/health/live`)).headers.get(REQUEST_ID_HEADER));
    }
    expect(ids.size).toBe(5);
  });

  it('ignores a request ID sent by the client (no log forging)', async () => {
    const response = await fetch(`${baseUrl}/health/live`, {
      headers: { [REQUEST_ID_HEADER]: 'forged-by-the-client' },
    });
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
