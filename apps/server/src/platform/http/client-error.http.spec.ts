// Spec 7.1 "every error has the standard shape", also for what Node answers itself before Nest sees
// a request: a malformed request line, an oversized header, a request that never completes. Sent
// over raw sockets, because `fetch` cannot produce them.
import { connect, type Socket } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ErrorBody, REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../clock/fake-clock.js';
import { DEFAULT_RUNTIME_LIMITS } from '../config/app-config.js';
import { testConfig } from '../config/config.testing.js';
import { JsonLogger } from '../logging/json-logger.js';
import { handleClientError } from './client-error.handler.js';
import { startTestApp } from './test-app.testing.js';

let app: INestApplication | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.destroy());
  await app?.close();
  app = undefined;
});

interface RawResponse {
  readonly status: number;
  readonly headers: Map<string, string>;
  readonly body: string;
  /** True when the server closed the connection after answering. */
  readonly closed: boolean;
}

function parse(raw: string, closed: boolean): RawResponse {
  const [head = '', ...rest] = raw.split('\r\n\r\n');
  const [statusLine = '', ...headerLines] = head.split('\r\n');
  const headers = new Map(
    headerLines.map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()] as const;
    }),
  );
  return { status: Number(statusLine.split(' ')[1]), headers, body: rest.join('\r\n\r\n'), closed };
}

/** Sends raw bytes and returns the whole answer once the server closes the connection. */
async function sendRaw(port: number, bytes: string): Promise<RawResponse> {
  const socket = connect(port, '127.0.0.1');
  sockets.push(socket);
  let raw = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => (raw += chunk));
  socket.on('error', () => undefined); // the server may reset the connection while we still send
  const closed = new Promise<void>((resolve) =>
    socket.on('close', () => {
      resolve();
    }),
  );
  socket.write(bytes);
  await closed;
  return parse(raw, true);
}

async function start(options: Parameters<typeof startTestApp>[0] = {}): Promise<number> {
  const started = await startTestApp(options);
  app = started.app;
  return Number(new URL(started.baseUrl).port);
}

function expectContractError(response: RawResponse, status: number, code: string): ErrorBody {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toMatch(/^application\/json/);
  expect(Number(response.headers.get('content-length'))).toBe(Buffer.byteLength(response.body));
  expect(response.headers.get('connection')).toBe('close');
  const body = ErrorBody.parse(JSON.parse(response.body));
  expect(body.code).toBe(code);
  expect(body.requestId).toBe(response.headers.get(REQUEST_ID_HEADER.toLowerCase()));
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.headers.get(SERVER_TIME_HEADER.toLowerCase())).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  return body;
}

describe('errors Node answers itself have the standard shape (spec 7.1)', () => {
  it('answers a malformed request line with VALIDATION in the error shape', async () => {
    const port = await start();
    const response = await sendRaw(port, 'THIS IS NOT HTTP\r\n\r\n');
    expectContractError(response, 400, 'VALIDATION');
    expect(response.closed).toBe(true);
  });

  it('answers an oversized header with VALIDATION in the error shape', async () => {
    const port = await start();
    const response = await sendRaw(
      port,
      `GET /health/live HTTP/1.1\r\nHost: x\r\nX-Big: ${'a'.repeat(100_000)}\r\n\r\n`,
    );
    expectContractError(response, 400, 'VALIDATION');
  });

  it('answers a request that never completes with UNAVAILABLE in the error shape', async () => {
    const port = await start({
      config: testConfig({
        limits: { ...DEFAULT_RUNTIME_LIMITS, headersTimeoutMs: 150, requestReceiveTimeoutMs: 150 },
      }),
    });
    // Headers that never end: the client stops after the first line.
    const response = await sendRaw(port, 'GET /health/live HTTP/1.1\r\nHost: x\r\n');
    expectContractError(response, 503, 'UNAVAILABLE');
  });

  it('serves normal requests on a fresh connection afterwards', async () => {
    const port = await start();
    await sendRaw(port, 'THIS IS NOT HTTP\r\n\r\n');
    const ok = await sendRaw(
      port,
      'GET /health/live HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
    );
    expect(ok.status).toBe(200);
  });

  it('echoes nothing the client sent, and logs only the status and the request ID (OPS-04)', async () => {
    const lines: Record<string, unknown>[] = [];
    const raw: string[] = [];
    const port = await start({
      logger: new JsonLogger((_level, line) => {
        raw.push(line);
        lines.push(JSON.parse(line) as Record<string, unknown>);
      }),
    });

    const response = await sendRaw(port, 'a.person@example.org /secret-path HTTP/1.1\r\n\r\n');

    const body = expectContractError(response, 400, 'VALIDATION');
    expect(JSON.stringify(body)).not.toMatch(/example\.org|secret-path/);
    expect(response.body).not.toMatch(/example\.org|secret-path/);
    const rejected = lines.find((line) => line['message'] === 'request rejected before routing');
    expect(rejected).toMatchObject({
      level: 'warn',
      context: 'Http',
      status: 400,
      requestId: body.requestId,
    });
    expect(raw.join('\n')).not.toMatch(/example\.org|secret-path/);
  });
});

describe('handleClientError', () => {
  const clock = new FakeClock('2026-11-01T09:30:00Z');

  it('closes a socket that cannot be written to, writing nothing', () => {
    const socket = {
      writable: false,
      destroyed: false,
      bytesWritten: 0,
      end: vi.fn(),
      destroy: vi.fn(),
    };
    handleClientError(new Error('read ECONNRESET'), socket, clock);
    expect(socket.end).not.toHaveBeenCalled();
    expect(socket.destroy).toHaveBeenCalledOnce();
  });

  it('closes a socket that already carries a partial answer, writing nothing more', () => {
    const socket = {
      writable: true,
      destroyed: false,
      bytesWritten: 17,
      end: vi.fn(),
      destroy: vi.fn(),
    };
    handleClientError(new Error('boom'), socket, clock);
    expect(socket.end).not.toHaveBeenCalled();
    expect(socket.destroy).toHaveBeenCalledOnce();
  });

  it('writes the contract error to a writable socket with the clock as server time', () => {
    const socket = {
      writable: true,
      destroyed: false,
      bytesWritten: 0,
      end: vi.fn(),
      destroy: vi.fn(),
    };
    handleClientError(
      Object.assign(new Error('x'), { code: 'HPE_HEADER_OVERFLOW' }),
      socket,
      clock,
    );
    expect(socket.end).toHaveBeenCalledOnce();
    const text = String(socket.end.mock.calls[0]?.[0]);
    expect(text).toMatch(/^HTTP\/1\.1 400 Bad Request\r\n/);
    expect(text).toContain('Pulse-Server-Time: 2026-11-01T09:30:00.000Z\r\n');
  });
});
