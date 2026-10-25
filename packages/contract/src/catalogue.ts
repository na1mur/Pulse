// The operation catalogue: every spec 7.2 operation, fully specified or name-only (D-29).
// Routes: reads are GET, every write is POST to a resource or resource action, so command bodies
// (with their command ID) never ride on DELETE. ADR 0003 records why.
import type { z } from 'zod';
import { authOperations } from './catalogue/auth.js';
import { namedOnlyOperations } from './catalogue/name-only.js';
import { settingsOperations } from './catalogue/settings.js';
import { systemOperations } from './catalogue/system.js';
import { timerAndSessionOperations } from './catalogue/timer-sessions.js';
import { errorCodesOf, successStatusOf, type HttpOperation, type Operation } from './operation.js';

export { errorCodesOf, successStatusOf };
export type {
  HttpOperation,
  Operation,
  OperationGroup,
  PendingOperation,
  RealtimeOperation,
} from './operation.js';

export const operations = {
  ...authOperations,
  ...timerAndSessionOperations,
  ...settingsOperations,
  ...namedOnlyOperations,
  ...systemOperations,
} as const satisfies Record<string, Operation>;

type Operations = typeof operations;
export type OperationName = keyof Operations;
export type HttpOperationName = {
  [Name in OperationName]: Operations[Name] extends { kind: 'http' } ? Name : never;
}[OperationName];

type PartOf<Name extends HttpOperationName, Part extends 'params' | 'query' | 'body'> =
  Operations[Name] extends Record<Part, infer Schema extends z.ZodType>
    ? z.output<Schema>
    : undefined;

/** `{ [Key]: Value }` when the operation has that part; otherwise the key must be absent. */
export type Present<Key extends string, Value> = [Value] extends [undefined]
  ? Partial<Record<Key, never>>
  : Record<Key, Value>;

/** Parsed path parameters, query and body of an operation (undefined where it has none). */
export type OperationParams<Name extends HttpOperationName> = PartOf<Name, 'params'>;
export type OperationQuery<Name extends HttpOperationName> = PartOf<Name, 'query'>;
export type OperationBody<Name extends HttpOperationName> = PartOf<Name, 'body'>;
/** The 200 body; undefined for 204 operations. */
export type OperationResponse<Name extends HttpOperationName> =
  Operations[Name]['response'] extends infer Schema extends z.ZodType
    ? z.output<Schema>
    : undefined;

export function httpOperation(name: HttpOperationName): HttpOperation {
  return operations[name];
}

/** Every fully specified HTTP operation, in catalogue order. */
export function httpOperations(): [HttpOperationName, HttpOperation][] {
  return Object.entries(operations).flatMap(([name, op]) =>
    op.kind === 'http' ? [[name as HttpOperationName, op as HttpOperation]] : [],
  );
}
