import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { formatNow } from './clock.js';
import { FakeClock } from './fake-clock.js';
import { SystemClock } from './system-clock.js';

describe('SystemClock', () => {
  it('reads the current instant at full precision', () => {
    const before = Temporal.Now.instant();
    const now = new SystemClock().now();
    const after = Temporal.Now.instant();
    expect(Temporal.Instant.compare(before, now)).toBeLessThanOrEqual(0);
    expect(Temporal.Instant.compare(now, after)).toBeLessThanOrEqual(0);
  });
});

describe('formatNow', () => {
  it('writes the clock reading as a stored instant: three fractional digits, floored', () => {
    expect(formatNow(new FakeClock('2026-10-25T08:30:00.2509Z'))).toBe('2026-10-25T08:30:00.250Z');
  });
});

describe('FakeClock', () => {
  it('stays where it is set until it is moved', () => {
    const clock = new FakeClock('2026-10-25T08:30:00.250Z');
    expect(clock.now().toString()).toBe('2026-10-25T08:30:00.25Z');
    expect(clock.now().toString()).toBe('2026-10-25T08:30:00.25Z');
  });

  it('can be set to another instant, earlier ones included', () => {
    const clock = new FakeClock('2026-10-25T08:30:00Z');
    clock.set('2026-10-24T23:59:59Z');
    expect(clock.now().toString()).toBe('2026-10-24T23:59:59Z');
  });

  it('advances by a duration', () => {
    const clock = new FakeClock('2026-10-24T23:59:59Z');
    clock.advance({ seconds: 1 });
    expect(clock.now().toString()).toBe('2026-10-25T00:00:00Z');
    clock.advance({ hours: 25, milliseconds: 500 });
    expect(clock.now().toString()).toBe('2026-10-26T01:00:00.5Z');
  });

  it('rejects an instant that is not ISO UTC', () => {
    expect(() => new FakeClock('2026-10-25 08:30')).toThrow();
  });
});
