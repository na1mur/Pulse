export type TimeMathErrorCode =
  'malformed-instant' | 'malformed-day' | 'unknown-time-zone' | 'invalid-seconds';

const DESCRIPTIONS: Record<TimeMathErrorCode, string> = {
  'malformed-instant': 'Not an ISO-8601 UTC instant ending in Z',
  'malformed-day': 'Not a YYYY-MM-DD calendar date',
  'unknown-time-zone': 'Not a known IANA timezone name',
  'invalid-seconds': 'Not a whole number of seconds in range',
};

/**
 * Invalid input to time math (ADR-0004): thrown instead of guessing a default. Inputs normally
 * arrive validated by the contract, so callers map this to VALIDATION or treat it as a bug.
 */
export class TimeMathError extends Error {
  constructor(
    readonly code: TimeMathErrorCode,
    readonly value: string,
    options?: ErrorOptions,
  ) {
    super(`${DESCRIPTIONS[code]}: ${JSON.stringify(value)}`, options);
    this.name = 'TimeMathError';
  }
}
