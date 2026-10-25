// Spec 7.1 error model: one shape for every error, on HTTP and on the realtime channel.
import { z } from 'zod';
import { Tag } from './entities.js';
import { Id } from './primitives.js';

export const ErrorCode = z.enum([
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'UNAVAILABLE',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** The HTTP status each code is sent with. */
export const ERROR_HTTP_STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

/** One invalid input field; `path` joins the location and keys with dots (`body.title`). */
export const FieldError = z.object({ path: z.string(), message: z.string() });

export const ErrorDetails = z.object({
  /** VALIDATION: the fields that failed. */
  fields: z.array(FieldError).optional(),
  /** CONFLICT on an overlap (R-05): the session it overlaps. */
  conflictingSessionId: Id.optional(),
  /** CONFLICT on a taken tag name (R-29): the existing tag, with its category. */
  existingTag: Tag.optional(),
});

export const ErrorBody = z.object({
  code: ErrorCode,
  /** Human-readable, for logs and sync issues; clients choose their own copy by `code`. */
  message: z.string(),
  details: ErrorDetails.optional(),
  /** The request ID the server logged this error under (spec 9.5). */
  requestId: z.string().min(1),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** A Standard Schema issue (zod's and any other validator's). */
export interface ValidationIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}

/** Field errors for VALIDATION details; `location` is `body`, `query`, `params` or `message`. */
export function fieldErrors(
  location: string,
  issues: readonly ValidationIssue[],
): z.infer<typeof FieldError>[] {
  return issues.map((issue) => ({
    path: [
      location,
      ...(issue.path ?? []).map((segment) =>
        String(typeof segment === 'object' ? segment.key : segment),
      ),
    ].join('.'),
    message: issue.message,
  }));
}
