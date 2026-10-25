import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { httpOperations, operations } from '../catalogue.js';
import { componentSchemas } from './components.js';
import { buildJsonSchemaBundle } from './json-schema.js';
import { buildOpenApiDocument } from './openapi.js';
import { generatedFiles } from './outputs.js';
import { syncGeneratedFolder } from './sync.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = Record<string, Json>;

function walk(value: Json, visit: (node: JsonObject) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value !== null && typeof value === 'object') {
    visit(value);
    for (const child of Object.values(value)) walk(child, visit);
  }
}

function refs(document: Json): string[] {
  const found: string[] = [];
  walk(document, (node) => {
    if (typeof node['$ref'] === 'string') found.push(node['$ref']);
  });
  return found;
}

const openApi = buildOpenApiDocument() as unknown as JsonObject;
const schemas = (openApi['components'] as JsonObject)['schemas'] as JsonObject;
const paths = openApi['paths'] as Record<string, Record<string, JsonObject>>;

describe('OpenAPI document', () => {
  it('is OpenAPI 3.0.3, the version progenitor accepts', () => {
    expect(openApi['openapi']).toBe('3.0.3');
  });

  it('has one path operation per fully specified HTTP operation', () => {
    for (const [name, op] of httpOperations()) {
      const item = paths[op.path]?.[op.method.toLowerCase()];
      expect(item, name).toBeDefined();
      expect(item?.['x-pulse-operation'], name).toBe(name);
    }
    const count = Object.values(paths).flatMap((item) => Object.keys(item)).length;
    expect(count).toBe(httpOperations().length);
  });

  it('lists name-only operations without shapes and the realtime channel by reference', () => {
    const pendingNames = Object.entries(operations)
      .filter(([, op]) => op.kind === 'pending')
      .map(([name]) => name);
    const listed = (openApi['x-pulse-pending-operations'] as JsonObject[]).map((op) => op['name']);
    expect(listed).toEqual(pendingNames);
    expect(openApi['x-pulse-realtime']).toEqual({
      path: '/v1/sync/stream',
      clientMessage: { $ref: '#/components/schemas/ClientMessage' },
      serverMessage: { $ref: '#/components/schemas/ServerMessage' },
    });
  });

  it('resolves every reference', () => {
    for (const ref of refs(openApi)) {
      const [, , section, name] = ref.split('/');
      const components = openApi['components'] as Record<string, JsonObject>;
      expect(components[section ?? '']?.[name ?? ''], ref).toBeDefined();
    }
  });

  it('uses no keyword OpenAPI 3.0 lacks', () => {
    walk(openApi, (node) => {
      for (const key of ['$id', '$schema', 'const', '$defs', 'definitions']) {
        expect(node, key).not.toHaveProperty(key);
      }
      if ('type' in node) expect(Array.isArray(node['type'])).toBe(false);
    });
  });

  it('gives each operation one success type and the error shape for every error (progenitor)', () => {
    for (const [name, op] of httpOperations()) {
      const responses = paths[op.path]?.[op.method.toLowerCase()]?.['responses'] as Record<
        string,
        JsonObject
      >;
      const success = Object.keys(responses).filter((status) => status.startsWith('2'));
      expect(success, name).toHaveLength(1);
      for (const [status, response] of Object.entries(responses)) {
        if (status.startsWith('2')) continue;
        expect(response['content'], `${name} ${status}`).toEqual({
          'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } },
        });
      }
    }
  });

  it('declares the server-time and request-ID headers on every response (spec 7.1)', () => {
    for (const item of Object.values(paths)) {
      for (const operation of Object.values(item)) {
        for (const response of Object.values(
          operation['responses'] as Record<string, JsonObject>,
        )) {
          expect(Object.keys(response['headers'] as JsonObject)).toEqual([
            'Pulse-Server-Time',
            'Pulse-Request-Id',
          ]);
        }
      }
    }
  });

  it('rejects unknown request fields and tolerates new response fields', () => {
    expect((schemas['StartTimerRequest'] as JsonObject)['additionalProperties']).toBe(false);
    expect(schemas['Session']).not.toHaveProperty('additionalProperties');
    expect(schemas['TimerResult']).not.toHaveProperty('additionalProperties');
  });

  it('keeps formats for UUIDs, days and instants without the long regexes', () => {
    const session = (schemas['Session'] as JsonObject)['properties'] as JsonObject;
    expect(session['id']).toMatchObject({ type: 'string', format: 'uuid' });
    expect(session['id']).not.toHaveProperty('pattern');
    expect(session['startedAt']).toMatchObject({ type: 'string', format: 'date-time' });
    expect(session['startedAt']).not.toHaveProperty('pattern');
  });

  it('references optional components directly, not through a one-element allOf', () => {
    walk(openApi, (node) => {
      const keys = Object.keys(node);
      expect(keys.length === 1 && keys[0] === 'allOf', JSON.stringify(node)).toBe(false);
    });
    const update = (schemas['UpdateSessionRequest'] as JsonObject)['properties'] as JsonObject;
    expect(update['tagId']).toEqual({ $ref: '#/components/schemas/TagUpdate' });
  });

  it('describes query integers as integers', () => {
    const parameters = paths['/v1/sync/changes']?.['get']?.['parameters'] as JsonObject[];
    expect(parameters[0]).toMatchObject({ name: 'since', in: 'query', required: true });
    expect((parameters[0]?.['schema'] as JsonObject)['type']).toBe('integer');
  });
});

describe('JSON Schema bundle', () => {
  const bundle = buildJsonSchemaBundle() as unknown as JsonObject;

  it('is draft-07 with every component under definitions', () => {
    expect(bundle['$schema']).toBe('http://json-schema.org/draft-07/schema#');
    const definitions = bundle['definitions'] as JsonObject;
    expect(Object.keys(definitions)).toEqual(Object.keys(schemas));
    for (const ref of refs(bundle)) {
      expect(definitions[ref.replace('#/definitions/', '')], ref).toBeDefined();
    }
  });
});

describe('generation', () => {
  it('reads and writes the same shape for every component (no defaults or transforms)', () => {
    expect(componentSchemas().size).toBeGreaterThan(50);
    // Output mode marks every object closed; apart from that both directions must agree.
    const shapes = (io: 'input' | 'output') =>
      JSON.stringify(buildOpenApiDocument(io).components.schemas).replaceAll(
        ',"additionalProperties":false',
        '',
      );
    expect(shapes('output')).toBe(shapes('input'));
  });

  it('is deterministic', () => {
    expect(generatedFiles()).toEqual(generatedFiles());
  });

  it('matches the committed files under generated/ (run `pnpm --filter @pulse/contract generate`)', () => {
    for (const [path, content] of generatedFiles()) {
      expect(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), path).toBe(content);
    }
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    expect(syncGeneratedFolder(packageRoot, generatedFiles(), 'check').extra).toEqual([]);
  });
});
