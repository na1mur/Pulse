// ADR-0004 clock: server time on every response (spec 7.1, 8.2) comes from the injected Clock,
// so tests can pin it. Covers the success path and the error paths (a body-parser error is rejected before routing).
import type { INestApplication } from '@nestjs/common';
import { SERVER_TIME_HEADER } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeClock } from './platform/clock/fake-clock.js';
import { startTestApp } from './platform/http/test-app.testing.js';

const clock = new FakeClock('2026-11-01T09:30:00Z');
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  ({ app, baseUrl } = await startTestApp({ clock }));
});

afterAll(async () => {
  await app.close();
});

describe('Pulse-Server-Time comes from the injected clock', () => {
  it('stamps a successful response with the clock, in milliseconds', async () => {
    clock.set('2026-11-01T09:30:00Z');
    const response = await fetch(`${baseUrl}/health/live`);
    expect(response.headers.get(SERVER_TIME_HEADER)).toBe('2026-11-01T09:30:00.000Z');
  });

  it('follows the clock when it moves', async () => {
    clock.set('2026-11-01T09:30:00Z');
    clock.advance({ seconds: 90, milliseconds: 250 });
    const response = await fetch(`${baseUrl}/health/live`);
    expect(response.headers.get(SERVER_TIME_HEADER)).toBe('2026-11-01T09:31:30.250Z');
  });

  it('stamps an unknown route (filter after the middleware)', async () => {
    clock.set('2027-01-01T00:00:00.999Z');
    const response = await fetch(`${baseUrl}/v1/nothing-here`);
    expect(response.headers.get(SERVER_TIME_HEADER)).toBe('2027-01-01T00:00:00.999Z');
  });

  it('stamps a body-parser error (rejected before routing)', async () => {
    clock.set('2028-02-29T12:00:00Z');
    const response = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"commandId":',
    });
    expect(response.status).toBe(400);
    expect(response.headers.get(SERVER_TIME_HEADER)).toBe('2028-02-29T12:00:00.000Z');
  });
});
