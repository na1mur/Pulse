// ADR-0004 whole seconds: every instant entering time math is floored to whole seconds since the
// Unix epoch; all math after that is integer arithmetic (R-16).
import { Temporal } from 'temporal-polyfill';
import { TimeMathError } from './time-math-error.js';

// The contract's Instant (spec 7.1): UTC with Z, any number of fractional digits. The fraction is
// never negative, so dropping it floors toward the past, before 1970 too.
const UTC_INSTANT =
  /^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.\d+)?Z$/;

/** Throws unless `seconds` is a safe integer (epoch seconds or a duration). */
export function assertSeconds(seconds: number): void {
  if (!Number.isSafeInteger(seconds)) throw new TimeMathError('invalid-seconds', String(seconds));
}

/** The instant `seconds` after the epoch; throws outside Temporal's range (about ±273 000 years). */
export function instantAt(seconds: number): Temporal.Instant {
  assertSeconds(seconds);
  try {
    return Temporal.Instant.fromEpochMilliseconds(seconds * 1000);
  } catch (error) {
    throw new TimeMathError('invalid-seconds', String(seconds), { cause: error });
  }
}

/** ISO-8601 UTC instant -> whole epoch seconds, floored. */
export function parseInstant(iso: string): number {
  const whole = UTC_INSTANT.exec(iso)?.[1];
  if (whole === undefined) throw new TimeMathError('malformed-instant', iso);
  try {
    // Whole seconds, so the division is exact. Temporal rejects dates such as 2026-02-30.
    return Temporal.Instant.from(`${whole}Z`).epochMilliseconds / 1000;
  } catch (error) {
    throw new TimeMathError('malformed-instant', iso, { cause: error });
  }
}

/** Whole epoch seconds -> ISO-8601 UTC instant without a fraction, e.g. `2026-10-25T08:30:00Z`. */
export function formatInstant(seconds: number): string {
  return instantAt(seconds).toString();
}

/**
 * A full-precision instant (the Clock's reading) as ISO-8601 UTC with exactly three fractional
 * digits, floored: `2026-10-25T08:30:00.250Z`. For the Pulse-Server-Time header (spec 7.1, 8.2),
 * which clients use for their clock offset, so it keeps the milliseconds time math drops.
 */
export function formatInstantMillis(instant: Temporal.Instant): string {
  return instant.toString({ fractionalSecondDigits: 3, roundingMode: 'floor' });
}

/** R-16, R-18: `end - start` in whole seconds, never negative. */
export function durationSeconds(start: number, end: number): number {
  assertSeconds(start);
  assertSeconds(end);
  return Math.max(0, end - start);
}
