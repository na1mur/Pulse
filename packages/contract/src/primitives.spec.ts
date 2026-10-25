import { describe, expect, it } from 'vitest';
import {
  CreditAmount,
  CreditRate,
  DayKey,
  Id,
  Instant,
  PeriodId,
  QueryInteger,
  Revision,
  Seconds,
  SessionSummary,
  SessionTitle,
  TagName,
  TimeZoneName,
  commandFields,
} from './primitives.js';
import { z } from 'zod';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

describe('primitives (spec 7.1 conventions)', () => {
  it('accepts UUIDs as IDs and rejects other strings (spec 6: client-generated IDs)', () => {
    expect(accepts(Id, '0192f1a6-7b3c-7d4e-8f00-1234567890ab')).toBe(true);
    expect(accepts(Id, 'not-a-uuid')).toBe(false);
    expect(accepts(Id, '')).toBe(false);
  });

  it('accepts only ISO-8601 UTC instants', () => {
    expect(accepts(Instant, '2026-10-25T08:30:00Z')).toBe(true);
    expect(accepts(Instant, '2026-10-25T08:30:00.123Z')).toBe(true);
    expect(accepts(Instant, '2026-10-25T10:30:00+02:00')).toBe(false);
    expect(accepts(Instant, '2026-10-25T08:30:00')).toBe(false);
    expect(accepts(Instant, '2026-10-25')).toBe(false);
  });

  it('accepts YYYY-MM-DD day keys only', () => {
    expect(accepts(DayKey, '2026-10-25')).toBe(true);
    expect(accepts(DayKey, '2026-02-30')).toBe(false);
    expect(accepts(DayKey, '2026-10-25T00:00:00Z')).toBe(false);
  });

  it('accepts the period IDs of R-14 for goal periods (day, week, month)', () => {
    expect(accepts(PeriodId, '2026-10-24')).toBe(true);
    expect(accepts(PeriodId, 'W2026-10-19')).toBe(true);
    expect(accepts(PeriodId, '2026-10')).toBe(true);
    expect(accepts(PeriodId, '2026-W43')).toBe(false);
    expect(accepts(PeriodId, '2026-13')).toBe(false);
  });

  it('keeps durations and revisions as non-negative integers', () => {
    expect(accepts(Seconds, 0)).toBe(true);
    expect(accepts(Seconds, 59)).toBe(true);
    expect(accepts(Seconds, 1.5)).toBe(false);
    expect(accepts(Seconds, -1)).toBe(false);
    expect(accepts(Revision, 42)).toBe(true);
    expect(accepts(Revision, -1)).toBe(false);
  });

  it('writes credits as decimal strings with exactly 2 places', () => {
    for (const value of ['0.00', '12.50', '-3.25', '1000000.01']) {
      expect(accepts(CreditAmount, value)).toBe(true);
    }
    for (const value of ['12.5', '12', '12.505', '+1.00', '01.00', 12.5, '-0.00x']) {
      expect(accepts(CreditAmount, value)).toBe(false);
    }
  });

  it('keeps credit rates non-negative (ADR-0003, QA T0.4 L5a)', () => {
    expect(accepts(CreditRate, '10.00')).toBe(true);
    expect(accepts(CreditRate, '0.00')).toBe(true);
    expect(accepts(CreditRate, '-10.00')).toBe(false);
    expect(accepts(CreditRate, '10')).toBe(false);
  });

  it('accepts IANA timezone names the runtime knows and rejects others', () => {
    for (const zone of ['UTC', 'Asia/Dhaka', 'America/Los_Angeles', 'Asia/Kathmandu']) {
      expect(accepts(TimeZoneName, zone)).toBe(true);
    }
    for (const zone of ['Mars/Olympus', '', '+02:00', 'Asia/Dhaka; drop']) {
      expect(accepts(TimeZoneName, zone)).toBe(false);
    }
  });

  it('enforces the Appendix A text limits: title <= 200, summary <= 2000, tag name 1-40', () => {
    expect(accepts(SessionTitle, 'a'.repeat(200))).toBe(true);
    expect(accepts(SessionTitle, 'a'.repeat(201))).toBe(false);
    expect(accepts(SessionSummary, 'a'.repeat(2000))).toBe(true);
    expect(accepts(SessionSummary, 'a'.repeat(2001))).toBe(false);
    expect(accepts(TagName, 'a'.repeat(40))).toBe(true);
    expect(accepts(TagName, 'a'.repeat(41))).toBe(false);
    expect(accepts(TagName, '   ')).toBe(false);
    // R-29: names are trimmed before the length check.
    expect(TagName.parse('  Deep Work  ')).toBe('Deep Work');
  });

  it('parses query integers from their URL text strictly', () => {
    expect(QueryInteger.parse('12')).toBe(12);
    expect(QueryInteger.parse('0')).toBe(0);
    for (const text of ['', ' 1', '1e3', '-1', '01', '1.5']) {
      expect(QueryInteger.safeParse(text).success).toBe(false);
    }
  });

  it('gives every command a command ID and an optional occurred-at time (R-34)', () => {
    const command = z.strictObject({ ...commandFields });
    expect(accepts(command, { commandId: '0192f1a6-7b3c-7d4e-8f00-1234567890ab' })).toBe(true);
    expect(
      accepts(command, {
        commandId: '0192f1a6-7b3c-7d4e-8f00-1234567890ab',
        occurredAt: '2026-10-25T08:30:00Z',
      }),
    ).toBe(true);
    expect(accepts(command, {})).toBe(false);
  });
});
