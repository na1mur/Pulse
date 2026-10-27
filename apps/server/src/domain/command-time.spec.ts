import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { commandInstant } from './command-time.js';

const now = Temporal.Instant.from('2026-10-27T10:00:00.250Z');
const floor = Temporal.Instant.from('2026-10-01T00:00:00Z');

describe('commandInstant (R-03)', () => {
  it('is server time for an online command', () => {
    expect(commandInstant(undefined, now, floor).toString()).toBe('2026-10-27T10:00:00.25Z');
  });

  it('is the occurred-at of a replayed command when it lies between the floor and now', () => {
    expect(commandInstant('2026-10-26T08:00:00Z', now, floor).toString()).toBe(
      '2026-10-26T08:00:00Z',
    );
  });

  it('never lies in the future: a skewed device clock is clamped to server time', () => {
    expect(commandInstant('2026-10-27T10:00:01Z', now, floor).toString()).toBe(
      '2026-10-27T10:00:00.25Z',
    );
    expect(commandInstant('2099-01-01T00:00:00Z', now, floor).toString()).toBe(
      '2026-10-27T10:00:00.25Z',
    );
  });

  it('never lies before the floor (the account did not exist yet)', () => {
    expect(commandInstant('2020-01-01T00:00:00Z', now, floor).toString()).toBe(
      '2026-10-01T00:00:00Z',
    );
  });

  it('falls back to server time for an occurred-at it cannot read', () => {
    expect(commandInstant('yesterday', now, floor).toString()).toBe('2026-10-27T10:00:00.25Z');
  });
});
