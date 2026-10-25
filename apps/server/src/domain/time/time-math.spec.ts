// Invalid input to time math: a typed TimeMathError, never a silent default or a library error.
// The happy paths are the shared fixtures (time-fixtures.spec.ts).
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  dayBounds,
  dayKey,
  dayRows,
  durationSeconds,
  formatClock,
  formatInstant,
  formatInstantMillis,
  parseInstant,
  period,
  periodId,
  periodTotal,
  summaryParts,
  TimeMathError,
  type TimeMathErrorCode,
} from './index.js';

const now = 1_792_917_000; // 2026-10-25T08:30:00Z

function codeOf(run: () => unknown): TimeMathErrorCode | 'no error' {
  try {
    run();
  } catch (error) {
    if (error instanceof TimeMathError) return error.code;
    throw error;
  }
  return 'no error';
}

// Which strings parseInstant rejects is shared with pulse-core: invalid-instant.json.
describe('parseInstant errors', () => {
  it('names the rejected value in the message', () => {
    expect(() => parseInstant('yesterday')).toThrow(/yesterday/);
  });
});

describe('formatInstantMillis (Pulse-Server-Time)', () => {
  it('always writes three fractional digits', () => {
    expect(formatInstantMillis(Temporal.Instant.from('2026-10-25T08:30:00Z'))).toBe(
      '2026-10-25T08:30:00.000Z',
    );
    expect(formatInstantMillis(Temporal.Instant.from('2026-10-25T08:30:00.25Z'))).toBe(
      '2026-10-25T08:30:00.250Z',
    );
  });

  it('floors sub-millisecond precision, before 1970 too', () => {
    expect(formatInstantMillis(Temporal.Instant.from('2026-10-25T08:30:59.999999999Z'))).toBe(
      '2026-10-25T08:30:59.999Z',
    );
    expect(formatInstantMillis(Temporal.Instant.from('1969-12-31T23:59:59.9995Z'))).toBe(
      '1969-12-31T23:59:59.999Z',
    );
  });
});

describe('day keys must be real YYYY-MM-DD dates', () => {
  it.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-1-5',
    '20261025',
    '2026-10-25T00:00',
    '',
  ])('%j', (day) => {
    expect(codeOf(() => dayBounds(day, 'UTC'))).toBe('malformed-day');
    expect(codeOf(() => period('week', day, 'monday', 'UTC'))).toBe('malformed-day');
    expect(codeOf(() => periodId('day', day, 'monday'))).toBe('malformed-day');
  });
});

describe('time zones must be known IANA names', () => {
  it.each(['Mars/Olympus_Mons', '+02:00', '-05:00', 'UTC+1', ''])('%j', (timeZone) => {
    expect(codeOf(() => dayKey(now, timeZone))).toBe('unknown-time-zone');
    expect(codeOf(() => dayBounds('2026-10-25', timeZone))).toBe('unknown-time-zone');
    expect(codeOf(() => period('day', '2026-10-25', 'monday', timeZone))).toBe('unknown-time-zone');
    expect(codeOf(() => dayRows({ startedAt: now - 60, endedAt: null, timeZone }, now))).toBe(
      'unknown-time-zone',
    );
    expect(codeOf(() => periodTotal([], 'day', '2026-10-25', 'monday', timeZone, now))).toBe(
      'unknown-time-zone',
    );
  });

  it("rejects a session's unknown zone even when the user's zone is fine", () => {
    const sessions = [{ startedAt: now - 60, endedAt: now, timeZone: 'Nowhere/Land' }];
    expect(codeOf(() => periodTotal(sessions, 'day', '2026-10-25', 'monday', 'UTC', now))).toBe(
      'unknown-time-zone',
    );
  });

  it('rejects a session with no seconds in it and an unknown zone too (no silent pass)', () => {
    expect(
      codeOf(() => dayRows({ startedAt: now, endedAt: now, timeZone: 'Nowhere/Land' }, now)),
    ).toBe('unknown-time-zone');
  });
});

describe('epoch seconds and durations must be safe integers', () => {
  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])('%s', (value) => {
    expect(codeOf(() => formatInstant(value))).toBe('invalid-seconds');
    expect(codeOf(() => durationSeconds(value, now))).toBe('invalid-seconds');
    expect(codeOf(() => durationSeconds(now, value))).toBe('invalid-seconds');
    expect(codeOf(() => dayKey(value, 'UTC'))).toBe('invalid-seconds');
    expect(codeOf(() => dayRows({ startedAt: value, endedAt: null, timeZone: 'UTC' }, now))).toBe(
      'invalid-seconds',
    );
    expect(codeOf(() => dayRows({ startedAt: now, endedAt: null, timeZone: 'UTC' }, value))).toBe(
      'invalid-seconds',
    );
    expect(codeOf(() => formatClock(value))).toBe('invalid-seconds');
    expect(codeOf(() => summaryParts(value))).toBe('invalid-seconds');
  });
});

describe('periodId', () => {
  it('gives the R-14 IDs without a timezone', () => {
    expect(periodId('day', '2026-10-24', 'monday')).toBe('2026-10-24');
    expect(periodId('week', '2026-10-24', 'monday')).toBe('W2026-10-19');
    expect(periodId('month', '2026-10-24', 'monday')).toBe('2026-10');
    expect(periodId('year', '2026-10-24', 'monday')).toBe('2026');
  });
});
