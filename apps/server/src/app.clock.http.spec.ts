// ADR-0004 clock: server time on every response (spec 7.1, 8.2) comes from the injected Clock,
// so tests can pin it. Covers the middleware path and the exception-filter path (body-parser
// errors arrive before the middleware runs).
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SERVER_TIME_HEADER } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { CLOCK } from './platform/clock/clock.js';
import { FakeClock } from './platform/clock/fake-clock.js';

const clock = new FakeClock('2026-11-01T09:30:00Z');
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
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

  it('stamps a body-parser error (filter before the middleware)', async () => {
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
