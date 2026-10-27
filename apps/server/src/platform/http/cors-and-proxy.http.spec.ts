// OPS-03: the CORS allow-list from CORS_ORIGINS (no wildcard, none by default) and the proxy trust
// from TRUST_PROXY, over real HTTP with the configuration the real server builds.
import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config/load-config.js';
import { testEnv } from '../config/config.testing.js';
import { startTestApp } from './test-app.testing.js';

@Controller()
class WhoAmIController {
  @Get('/test/ip')
  ip(@Req() request: { ip?: string; protocol: string }): {
    ip: string | undefined;
    protocol: string;
  } {
    return { ip: request.ip, protocol: request.protocol };
  }
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(env: Record<string, string>): Promise<string> {
  const started = await startTestApp({
    config: loadConfig(testEnv(env)),
    controllers: [WhoAmIController],
  });
  app = started.app;
  return started.baseUrl;
}

describe('OPS-03: CORS allow-list', () => {
  it('allows no origin by default: no CORS headers, not even for a preflight', async () => {
    const baseUrl = await start({});
    const simple = await fetch(`${baseUrl}/health/live`, {
      headers: { origin: 'https://evil.org' },
    });
    expect(simple.status).toBe(200);
    expect(simple.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.org', 'access-control-request-method': 'POST' },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows exactly the listed origins, never a wildcard', async () => {
    const baseUrl = await start({ CORS_ORIGINS: 'https://app.example.org,http://localhost:1420' });
    const origins = new Map<string, string | null>();
    for (const origin of [
      'https://app.example.org',
      'http://localhost:1420',
      'https://evil.org',
      'https://app.example.org.evil.org',
      'http://app.example.org',
      'null',
    ]) {
      const response = await fetch(`${baseUrl}/health/live`, { headers: { origin } });
      origins.set(origin, response.headers.get('access-control-allow-origin'));
    }
    expect(Object.fromEntries(origins)).toEqual({
      'https://app.example.org': 'https://app.example.org',
      'http://localhost:1420': 'http://localhost:1420',
      'https://evil.org': null,
      'https://app.example.org.evil.org': null,
      'http://app.example.org': null,
      null: null,
    });
  });

  it('answers a preflight from a listed origin and lets the browser read server time', async () => {
    const baseUrl = await start({ CORS_ORIGINS: 'https://app.example.org' });
    const preflight = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example.org',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.example.org');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'authorization',
    );
    // A cached preflight must not be reused for another origin.
    expect(preflight.headers.get('vary')).toContain('Origin');
    // The request ID and server time are there even on the preflight.
    expect(preflight.headers.get(REQUEST_ID_HEADER)).not.toBeNull();

    const actual = await fetch(`${baseUrl}/health/live`, {
      headers: { origin: 'https://app.example.org' },
    });
    const exposed = actual.headers.get('access-control-expose-headers') ?? '';
    expect(exposed).toContain(REQUEST_ID_HEADER);
    expect(exposed).toContain(SERVER_TIME_HEADER);
    // Bearer tokens travel in a header: no cookie credentials mode.
    expect(actual.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('adds the CORS headers to error answers too', async () => {
    const baseUrl = await start({ CORS_ORIGINS: 'https://app.example.org' });
    const response = await fetch(`${baseUrl}/v1/does/not/exist`, {
      headers: { origin: 'https://app.example.org' },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.org');
  });
});

describe('OPS-03: proxy trust', () => {
  const forwarded = { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https' };

  it('ignores forwarding headers by default (TRUST_PROXY=0): a client cannot choose its IP', async () => {
    const baseUrl = await start({});
    const response = await fetch(`${baseUrl}/test/ip`, { headers: forwarded });
    const body = (await response.json()) as { ip: string; protocol: string };
    expect(body.ip).toMatch(/127\.0\.0\.1$/);
    expect(body.protocol).toBe('http');
  });

  it('takes the client address from the forwarding header behind one trusted proxy', async () => {
    const baseUrl = await start({ TRUST_PROXY: '1' });
    const response = await fetch(`${baseUrl}/test/ip`, { headers: forwarded });
    expect(await response.json()).toEqual({ ip: '203.0.113.9', protocol: 'https' });
  });

  it('trusts only as many hops as configured: a spoofed leftmost entry is not believed', async () => {
    const baseUrl = await start({ TRUST_PROXY: '1' });
    const response = await fetch(`${baseUrl}/test/ip`, {
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
    });
    expect(((await response.json()) as { ip: string }).ip).toBe('203.0.113.9');
  });
});
