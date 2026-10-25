// The named schemas of the generated documents: every exported schema of the entity, error,
// event and operation modules, named after its export. Path parameter and query objects are not
// components; they become OpenAPI parameters. Primitives stay inline (an ID is just a uuid).
import { z } from 'zod';
import { httpOperations } from '../catalogue.js';
import * as entities from '../entities.js';
import * as errors from '../errors.js';
import * as events from '../events.js';
import * as auth from '../operations/auth.js';
import * as settings from '../operations/settings.js';
import * as system from '../operations/system.js';
import * as timer from '../operations/timer-sessions.js';

const modules = [entities, errors, events, auth, timer, settings, system];

function collectComponents(): ReadonlyMap<string, z.ZodType> {
  const parameterObjects = new Set<z.ZodType>(
    httpOperations().flatMap(([, op]) =>
      [op.params, op.query].filter((part) => part !== undefined),
    ),
  );
  const found = new Map<string, z.ZodType>();
  for (const module of modules) {
    for (const [name, value] of Object.entries(module)) {
      if (!(value instanceof z.ZodType) || parameterObjects.has(value)) continue;
      if (found.has(name)) throw new Error(`Two contract schemas are both exported as ${name}`);
      found.set(name, value);
    }
  }
  return new Map([...found].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const components = collectComponents();

/** Component name -> schema, sorted by name so the output order never depends on imports. */
export function componentSchemas(): ReadonlyMap<string, z.ZodType> {
  return components;
}

/** The component name of a schema instance, if it is one. */
export function componentNameOf(schema: z.ZodType): string | undefined {
  for (const [name, component] of components) {
    if (component === schema) return name;
  }
  return undefined;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Removes what the Rust generators trip over: per-schema `$id`/`$schema` (zod adds them to each
 * registry entry) and the long regexes zod adds next to a `format` (uuid, date, date-time, email,
 * uri), which typify would otherwise turn into regex newtypes instead of `Uuid` or chrono types,
 * and the one-element `allOf` zod wraps around an optional reference (a plain `$ref` is the same
 * schema and needs no merging). The TypeScript side still validates with the full zod schema.
 */
export function cleanSchema(value: Json): Json {
  if (Array.isArray(value)) return value.map(cleanSchema);
  if (value === null || typeof value !== 'object') return value;
  const { allOf } = value;
  if (Object.keys(value).length === 1 && Array.isArray(allOf) && allOf.length === 1) {
    return cleanSchema(allOf[0] ?? null);
  }
  const cleaned: Record<string, Json> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '$id' || key === '$schema') continue;
    if (key === 'pattern' && typeof value['format'] === 'string') continue;
    cleaned[key] = cleanSchema(child);
  }
  return cleaned;
}

export function toJsonSchemas(
  target: 'openapi-3.0' | 'draft-07',
  uriPrefix: string,
  io: 'input' | 'output' = 'input',
): Record<string, Json> {
  const registry = z.registry<{ id: string }>();
  for (const [name, schema] of components) registry.add(schema, { id: name });
  const { schemas } = z.toJSONSchema(registry, {
    target,
    // Input mode: plain objects stay open (tolerant readers), strict request objects stay closed.
    io,
    unrepresentable: 'throw',
    uri: (id) => `${uriPrefix}${id}`,
  });
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [name, cleanSchema(schema as Json)]),
  );
}

export type { Json };
