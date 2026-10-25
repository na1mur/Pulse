// Mock server for client work before the real endpoints exist: every fully specified operation
// answers its example after contract validation; the realtime channel sends `ready` and every
// example event once a client authenticates. No state, no real auth (any bearer token passes).
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { httpOperations, operations, successStatusOf, type HttpOperation } from '../catalogue.js';
import { ERROR_HTTP_STATUS, fieldErrors, type ErrorBody, type ErrorCode } from '../errors.js';
import { ClientMessage, type ServerMessage } from '../events.js';
import { eventExamples, operationExamples } from '../examples/index.js';
import { REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '../http.js';

const MAX_BODY_BYTES = 1_000_000;

export interface MockServer {
  url: string;
  close: () => Promise<void>;
}

interface Route {
  name: keyof typeof operationExamples;
  op: HttpOperation;
  pattern: RegExp;
  paramNames: string[];
}

const routes: Route[] = httpOperations().map(([name, op]) => ({
  name,
  op,
  pattern: new RegExp(`^${op.path.replace(/\{\w+\}/g, '([^/]+)')}$`),
  paramNames: [...op.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? ''),
}));

class MockError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorBody['details'],
  ) {
    super(message);
  }
}

function send(response: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    response.writeHead(status).end();
    return;
  }
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new MockError('VALIDATION', 'The request body is too large.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MockError('VALIDATION', 'The request body is not JSON.');
  }
}

function validate(location: string, schema: HttpOperation['body'], value: unknown): void {
  if (!schema) return;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new MockError('VALIDATION', 'The request is invalid.', {
      fields: fieldErrors(location, result.error.issues),
    });
  }
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://mock');
  const route = routes.find(
    (candidate) => candidate.op.method === request.method && candidate.pattern.test(url.pathname),
  );
  if (!route) {
    throw new MockError('NOT_FOUND', `No operation at ${request.method ?? ''} ${url.pathname}.`);
  }
  if (route.op.auth === 'user' && !/^Bearer \S+$/.test(request.headers.authorization ?? '')) {
    throw new MockError('UNAUTHENTICATED', 'A bearer access token is required.');
  }
  const values = route.pattern.exec(url.pathname)?.slice(1) ?? [];
  const params = Object.fromEntries(
    route.paramNames.map((name, index) => [name, decodeURIComponent(values[index] ?? '')]),
  );
  validate('params', route.op.params, params);
  validate('query', route.op.query, Object.fromEntries(url.searchParams));
  validate('body', route.op.body, await readBody(request));
  const example = operationExamples[route.name];
  send(response, successStatusOf(route.op), 'response' in example ? example.response : undefined);
}

function sendMessage(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function onSocket(socket: WebSocket): void {
  const now = () => new Date().toISOString();
  socket.on('message', (data: Buffer) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString('utf8'));
    } catch {
      parsed = undefined;
    }
    const message = ClientMessage.safeParse(parsed);
    if (!message.success) {
      sendMessage(socket, {
        type: 'error',
        serverTime: now(),
        error: {
          code: 'VALIDATION',
          message: 'Clients send only auth and ping messages.',
          requestId: randomUUID(),
          details: { fields: fieldErrors('message', message.error.issues) },
        },
      });
      socket.close(1008, 'invalid message');
      return;
    }
    if (message.data.type === 'ping') {
      sendMessage(socket, { type: 'pong', serverTime: now() });
      return;
    }
    // Example events ascend in revision; ready reports the revision just before the first.
    const events = Object.values(eventExamples);
    const before = Math.min(...events.map((event) => event.revision)) - 1;
    sendMessage(socket, { type: 'ready', serverTime: now(), revision: before });
    for (const event of events) {
      sendMessage(socket, { type: 'event', serverTime: now(), event });
    }
  });
}

export async function startMockServer(options: { port: number }): Promise<MockServer> {
  const server = createServer((request, response) => {
    // As on the real server: one request ID per request, in the header and in any error body.
    const requestId = randomUUID();
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.setHeader(SERVER_TIME_HEADER, new Date().toISOString());
    handle(request, response).catch((error: unknown) => {
      const known = error instanceof MockError ? error : new MockError('INTERNAL', String(error));
      const body: ErrorBody = { code: known.code, message: known.message, requestId };
      if (known.details) body.details = known.details;
      send(response, ERROR_HTTP_STATUS[known.code], body);
    });
  });
  const sockets = new WebSocketServer({ server, path: operations['sync.subscribe'].path });
  sockets.on('connection', onSocket);
  const host = '127.0.0.1';
  await new Promise<void>((resolve) => server.listen(options.port, host, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${host}:${port}`,
    close: async () => {
      for (const client of sockets.clients) client.terminate();
      await new Promise<void>((resolve, reject) => {
        sockets.close();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
