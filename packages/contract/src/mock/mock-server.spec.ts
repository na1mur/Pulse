import { afterEach, describe, expect, it } from 'vitest';
import { createClient } from '../client.js';
import { ErrorBody } from '../errors.js';
import { ServerMessage } from '../events.js';
import { eventExamples, operationExamples } from '../examples/index.js';
import { REQUEST_ID_HEADER } from '../http.js';
import { startMockServer, type MockServer } from './mock-server.js';

let server: MockServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function nextMessages(socket: WebSocket, count: number): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const received: unknown[] = [];
    socket.addEventListener('error', () => {
      reject(new Error('WebSocket error'));
    });
    socket.addEventListener('message', (message) => {
      received.push(JSON.parse(String(message.data)));
      if (received.length === count) resolve(received);
    });
  });
}

describe('mock server', () => {
  it('answers fully specified operations with their schema-valid examples', async () => {
    server = await startMockServer({ port: 0 });
    const client = createClient({ baseUrl: server.url, fetch, accessToken: () => 'any' });

    const timer = await client.call('timer.get', {});
    expect(timer).toMatchObject({ ok: true, data: operationExamples['timer.get'].response });
    expect(timer.serverTime).toMatch(/Z$/);

    const started = await client.call('timer.start', {
      body: operationExamples['timer.start'].body,
    });
    expect(started).toMatchObject({ ok: true, data: operationExamples['timer.start'].response });
  });

  it('validates requests with the contract and answers in the error shape', async () => {
    server = await startMockServer({ port: 0 });
    const response = await fetch(`${server.url}/v1/timer/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer any' },
      body: JSON.stringify({ title: 'no command ID' }),
    });
    expect(response.status).toBe(400);
    const body = ErrorBody.parse(await response.json());
    expect(body.code).toBe('VALIDATION');
    expect(body.details?.fields?.map((field) => field.path)).toContain('body.commandId');
    // QA T0.4 L3: the error names the same request ID as the header, as the real server does.
    expect(body.requestId).toBe(response.headers.get(REQUEST_ID_HEADER));
  });

  it('answers unknown routes and name-only operations with NOT_FOUND', async () => {
    server = await startMockServer({ port: 0 });
    const response = await fetch(`${server.url}/v1/stats/today`);
    expect(response.status).toBe(404);
    expect(ErrorBody.parse(await response.json()).code).toBe('NOT_FOUND');
  });

  it('asks for a bearer token on user operations', async () => {
    server = await startMockServer({ port: 0 });
    const response = await fetch(`${server.url}/v1/timer`);
    expect(response.status).toBe(401);
    expect(ErrorBody.parse(await response.json()).code).toBe('UNAUTHENTICATED');
  });

  it('streams example events after a client authenticates over WebSocket', async () => {
    server = await startMockServer({ port: 0 });
    const socket = new WebSocket(`${server.url.replace('http', 'ws')}/v1/sync/stream`);
    await new Promise((resolve) => {
      socket.addEventListener('open', resolve);
    });
    const messages = nextMessages(socket, 1 + Object.keys(eventExamples).length);
    socket.send(JSON.stringify({ type: 'auth', accessToken: 'any' }));

    const [ready, ...events] = (await messages).map((message) => ServerMessage.parse(message));
    socket.close();
    expect(ready?.type === 'ready' && ready.revision).toBe(
      Math.min(
        ...events.map((message) => (message.type === 'event' ? message.event.revision : 0)),
      ) - 1,
    );
    expect(events.map((message) => message.type === 'event' && message.event.name)).toEqual(
      Object.keys(eventExamples),
    );
  });

  it('rejects state sent over the channel with a VALIDATION error message', async () => {
    server = await startMockServer({ port: 0 });
    const socket = new WebSocket(`${server.url.replace('http', 'ws')}/v1/sync/stream`);
    await new Promise((resolve) => {
      socket.addEventListener('open', resolve);
    });
    const messages = nextMessages(socket, 1);
    socket.send(JSON.stringify({ type: 'event', event: eventExamples['timer.changed'] }));

    const [message] = (await messages).map((value) => ServerMessage.parse(value));
    socket.close();
    expect(message).toMatchObject({ type: 'error', error: { code: 'VALIDATION' } });
  });
});
