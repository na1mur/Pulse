import { describe, expect, it } from 'vitest';
import { createClient } from './client.js';
import { operationExamples } from './examples/index.js';

interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Recorded[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    const text = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(
      new Response(text, {
        status,
        headers: {
          'Pulse-Server-Time': '2026-10-25T08:00:00.123Z',
          'Pulse-Request-Id': 'r-1',
          ...headers,
        },
      }),
    );
  };
  return { calls, fetch: fetch };
}

describe('typed client (derived from the catalogue)', () => {
  it('sends a command as JSON with the bearer token and returns the typed result', async () => {
    const example = operationExamples['timer.start'];
    const { calls, fetch } = fakeFetch(200, example.response);
    const client = createClient({
      baseUrl: 'https://pulse.example.com/',
      fetch,
      accessToken: () => 'token-1',
    });

    const result = await client.call('timer.start', { body: example.body });

    expect(calls[0]).toMatchObject({
      url: 'https://pulse.example.com/v1/timer/start',
      method: 'POST',
      body: JSON.stringify(example.body),
    });
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-1');
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: example.response,
      serverTime: '2026-10-25T08:00:00.123Z',
      requestId: 'r-1',
    });
  });

  it('fills path parameters and serialises query values', async () => {
    const { calls, fetch } = fakeFetch(200, operationExamples['sessions.get'].response);
    const client = createClient({ baseUrl: 'http://localhost:3000', fetch });
    await client.call('sessions.get', {
      params: { sessionId: '0192f1a6-0000-7000-8000-000000000020' },
    });
    expect(calls[0]?.url).toBe(
      'http://localhost:3000/v1/sessions/0192f1a6-0000-7000-8000-000000000020',
    );

    const changes = fakeFetch(200, operationExamples['sync.listChanges'].response);
    await createClient({ baseUrl: 'http://localhost:3000', fetch: changes.fetch }).call(
      'sync.listChanges',
      { query: { since: 19 } },
    );
    expect(changes.calls[0]?.url).toBe('http://localhost:3000/v1/sync/changes?since=19');
  });

  it('returns errors in the contract shape as values', async () => {
    const error = { code: 'CONFLICT', message: 'Overlap', requestId: 'r-2' };
    const { fetch } = fakeFetch(409, error);
    const result = await createClient({ baseUrl: 'http://x', fetch }).call('sessions.create', {
      body: operationExamples['sessions.create'].body,
    });
    expect(result).toMatchObject({ ok: false, status: 409, error });
  });

  it('turns a response that breaks the contract into an INTERNAL error', async () => {
    const { fetch } = fakeFetch(200, { running: 'yes' });
    const result = await createClient({ baseUrl: 'http://x', fetch }).call('timer.get', {});
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL', requestId: 'r-1' } });
  });

  it('turns a non-contract error page into UNAVAILABLE', async () => {
    const { fetch } = fakeFetch(502, '<html>Bad gateway</html>');
    const result = await createClient({ baseUrl: 'http://x', fetch }).call('health.get', {});
    expect(result).toMatchObject({ ok: false, status: 502, error: { code: 'UNAVAILABLE' } });
  });

  it('accepts 204 answers without a body', async () => {
    const { fetch } = fakeFetch(204, undefined);
    const result = await createClient({ baseUrl: 'http://x', fetch }).call('auth.logout', {});
    expect(result).toMatchObject({ ok: true, status: 204, data: undefined });
  });
});
