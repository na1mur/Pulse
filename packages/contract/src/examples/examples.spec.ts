import { describe, expect, it } from 'vitest';
import { httpOperations } from '../catalogue.js';
import { ErrorBody } from '../errors.js';
import { ClientMessage, Event, ServerMessage } from '../events.js';
import {
  clientMessageExamples,
  errorExamples,
  eventExamples,
  operationExamples,
  serverMessageExamples,
} from './index.js';

describe('example payloads (shared with the Rust conformance test and the mock server)', () => {
  it('has a schema-valid example for every part of every fully specified operation', () => {
    for (const [name, op] of httpOperations()) {
      const example: Record<string, unknown> = operationExamples[name];
      for (const part of ['params', 'query', 'body'] as const) {
        const schema = op[part];
        if (schema) {
          const result = schema.safeParse(example[part]);
          expect(result.error, `${name} ${part}`).toBeUndefined();
        } else {
          expect(example[part], `${name} ${part}`).toBeUndefined();
        }
      }
      if (op.response) {
        expect(op.response.safeParse(example['response']).error, name).toBeUndefined();
      } else {
        expect(example['response'], name).toBeUndefined();
      }
    }
  });

  it('sends query examples as URL text', () => {
    for (const [name] of httpOperations()) {
      const query: unknown = (operationExamples[name] as { query?: unknown }).query;
      if (query === undefined) continue;
      for (const value of Object.values(query as Record<string, unknown>)) {
        expect(typeof value, name).toBe('string');
      }
    }
  });

  it('has a valid example of every spec 7.3 event, each with a revision (R-35)', () => {
    const names = Event.options.map((option) => option.shape.name.value);
    expect(Object.keys(eventExamples).sort()).toEqual([...names].sort());
    for (const [name, example] of Object.entries(eventExamples)) {
      expect(Event.parse(example).name).toBe(name);
      expect(example.revision).toBeGreaterThan(0);
    }
    // The mock streams them in this order; a client applies only newer revisions (R-35).
    const revisions = Object.values(eventExamples).map((example) => example.revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
  });

  it('has valid examples of every realtime message type', () => {
    expect(clientMessageExamples.map((message) => message.type).sort()).toEqual(['auth', 'ping']);
    expect(serverMessageExamples.map((message) => message.type).sort()).toEqual([
      'error',
      'event',
      'pong',
      'ready',
    ]);
    for (const message of clientMessageExamples) {
      expect(ClientMessage.parse(message)).toEqual(message);
    }
    for (const message of serverMessageExamples) {
      expect(ServerMessage.parse(message)).toEqual(message);
    }
  });

  it('has a valid error example for every error code', () => {
    expect(errorExamples.map((error) => error.code).sort()).toEqual(
      [...ErrorBody.shape.code.options].sort(),
    );
    for (const error of errorExamples) expect(ErrorBody.parse(error)).toEqual(error);
  });
});
