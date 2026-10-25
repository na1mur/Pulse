// The shape of one catalogue entry and the types derived from it. Every generator, the server's
// routing and validation, the typed client and the mock server read the catalogue through these.
import type { z } from 'zod';
import { ErrorCode } from './errors.js';

export type OperationGroup =
  | 'auth'
  | 'timer'
  | 'sessions'
  | 'tags'
  | 'goals'
  | 'preferences'
  | 'stats'
  | 'usage'
  | 'credits'
  | 'achievements'
  | 'push'
  | 'sync'
  | 'data'
  | 'appUpdates'
  | 'health';

type RequestPart = z.ZodObject;

/** A fully specified request/response operation. */
export interface HttpOperation {
  readonly kind: 'http';
  readonly group: OperationGroup;
  readonly summary: string;
  readonly method: 'GET' | 'POST';
  /** OpenAPI path template, e.g. `/v1/sessions/{sessionId}`. */
  readonly path: string;
  /** `user`: needs a bearer access token. */
  readonly auth: 'none' | 'user';
  readonly params?: RequestPart;
  readonly query?: RequestPart;
  readonly body?: RequestPart;
  /** The 200 body; null answers 204 No Content. */
  readonly response: z.ZodType | null;
  /** Codes this operation can answer beyond the common ones (see errorCodesOf). */
  readonly errors: readonly ErrorCode[];
}

/** The realtime channel (spec 7.2 Sync "subscribe", spec 7.3). */
export interface RealtimeOperation {
  readonly kind: 'realtime';
  readonly group: 'sync';
  readonly summary: string;
  readonly path: string;
  readonly auth: 'user';
  readonly clientMessage: z.ZodType;
  readonly serverMessage: z.ZodType;
}

/** D-29: named now, shaped by the feature task or feature ID in `definedBy`. */
export interface PendingOperation {
  readonly kind: 'pending';
  readonly group: OperationGroup;
  readonly summary: string;
  readonly definedBy: string;
  readonly priority: 'P0' | 'P1' | 'P2';
}

export type Operation = HttpOperation | RealtimeOperation | PendingOperation;

export function http<const Spec extends Omit<HttpOperation, 'kind'>>(spec: Spec) {
  return { kind: 'http', ...spec } as const;
}

export function pending(
  group: OperationGroup,
  summary: string,
  definedBy: string,
  priority: PendingOperation['priority'] = 'P0',
): PendingOperation {
  return { kind: 'pending', group, summary, definedBy, priority };
}

/** Codes every operation can answer, plus its own. */
export function errorCodesOf(op: HttpOperation): ErrorCode[] {
  const codes = new Set<ErrorCode>(op.errors);
  if (op.params ?? op.query ?? op.body) codes.add('VALIDATION');
  if (op.auth === 'user') codes.add('UNAUTHENTICATED');
  codes.add('UNAVAILABLE');
  codes.add('INTERNAL');
  // The enum's order, so a new code can never drop out of the generated documents.
  return ErrorCode.options.filter((code) => codes.has(code));
}

export function successStatusOf(op: HttpOperation): 200 | 204 {
  return op.response === null ? 204 : 200;
}
