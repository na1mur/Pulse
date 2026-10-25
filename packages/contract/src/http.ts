// HTTP conventions shared by the server, the client and the mock server (ADR 0003).

/** Spec 7.1: every response carries server time (ISO-8601 UTC with milliseconds, spec 8.2). */
export const SERVER_TIME_HEADER = 'Pulse-Server-Time';
/** Spec 9.5: the request ID the server logged the request under; errors repeat it in the body. */
export const REQUEST_ID_HEADER = 'Pulse-Request-Id';

export const RESPONSE_HEADERS = {
  [SERVER_TIME_HEADER]: {
    description: 'Server time when the response was produced, for the clock offset (spec 8.2).',
    schema: { type: 'string', format: 'date-time' },
  },
  [REQUEST_ID_HEADER]: {
    description: 'Request ID, also in error bodies (spec 9.5).',
    schema: { type: 'string' },
  },
} as const;
