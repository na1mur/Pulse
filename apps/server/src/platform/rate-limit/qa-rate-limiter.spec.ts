// QA T1.5 round 2 (docs/qa/T1.5.md): the per-rule, never-evict-a-refusing-window limiter of the
// bug 2 fix, attacked directly with a fake clock and a small bound.
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock/fake-clock.js';
import { DEFAULT_MAX_ENTRIES, RateLimiter, type RateRule } from './rate-limiter.js';

const START = '2026-10-27T10:00:00Z';
const FAILURES: RateRule = { name: 'login-failures-account', limit: 10, windowMs: 15 * 60_000 };
const CHEAP: RateRule = { name: 'resend-account', limit: 1, windowMs: 60_000 };

function setUp(maxEntries?: number): { clock: FakeClock; limiter: RateLimiter } {
  const clock = new FakeClock(START);
  return { clock, limiter: new RateLimiter(clock, maxEntries) };
}

const hitTimes = (limiter: RateLimiter, rule: RateRule, key: string, times: number): void => {
  for (let n = 0; n < times; n += 1) limiter.hit(rule, key);
};

describe('QA T1.5 round 2: RateLimiter', () => {
  it('keeps a blocked account blocked through a flood of new keys on the same rule and on other rules', () => {
    const { limiter } = setUp(50);
    hitTimes(limiter, FAILURES, 'victim', 10);
    expect(limiter.hit(FAILURES, 'victim').allowed).toBe(false);
    for (let key = 0; key < 5_000; key += 1) {
      limiter.hit(FAILURES, `flood-${key}`);
      limiter.hit(CHEAP, `flood-${key}`);
    }
    expect(limiter.hit(FAILURES, 'victim').allowed).toBe(false);
    // Bounded per rule.
    expect(limiter.size).toBeLessThanOrEqual(100);
  });

  it('evicts the least used window first, the oldest among equals, and never a refusing one', () => {
    const { limiter } = setUp(4);
    hitTimes(limiter, FAILURES, 'blocked', 10);
    hitTimes(limiter, FAILURES, 'older-one', 1);
    hitTimes(limiter, FAILURES, 'newer-one', 1);
    hitTimes(limiter, FAILURES, 'three', 3);
    limiter.hit(FAILURES, 'new-1'); // evicts older-one
    limiter.hit(FAILURES, 'new-2'); // evicts newer-one (new-1 is newer)
    // Evicted windows start again at 1: ten more are allowed on older-one only if it was dropped.
    const allowed = (key: string): number => {
      let count = 0;
      for (let n = 0; n < 12; n += 1) if (limiter.hit(FAILURES, key).allowed) count += 1;
      return count;
    };
    expect(limiter.hit(FAILURES, 'blocked').allowed).toBe(false);
    // 'three' kept its count: 7 more fit.
    expect(allowed('three')).toBe(7);
  });

  it('fails closed with Retry-After set by the earliest-ending window, then reopens exactly then', () => {
    const { clock, limiter } = setUp(3);
    hitTimes(limiter, FAILURES, 'a', 10);
    clock.advance({ minutes: 5 });
    hitTimes(limiter, FAILURES, 'b', 10);
    hitTimes(limiter, FAILURES, 'c', 10);
    expect(limiter.hit(FAILURES, 'newcomer')).toEqual({ allowed: false, retryAfterSeconds: 600 });
    clock.advance({ minutes: 10 });
    expect(limiter.hit(FAILURES, 'newcomer').allowed).toBe(true);
    // The expired window of 'a' was dropped, 'b' and 'c' are still refusing.
    expect(limiter.hit(FAILURES, 'b').allowed).toBe(false);
  });

  it('lets an account one guess short of its limit be evicted when every other window is refusing (Low note R2-1)', () => {
    // The fix's guarantee is "a window at its limit is never evicted". One under the limit is
    // evictable, so an attacker who holds the rest of the table at the limit gets a fresh counter
    // for the victim with one new key per nine guesses. Recorded behaviour, not a requirement.
    const { limiter } = setUp(3);
    hitTimes(limiter, FAILURES, 'held-1', 10);
    hitTimes(limiter, FAILURES, 'held-2', 10);
    let guesses = 0;
    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (let n = 0; n < 9; n += 1) if (limiter.hit(FAILURES, 'victim').allowed) guesses += 1;
      limiter.hit(FAILURES, `filler-${cycle}`);
    }
    expect(guesses).toBe(45);
  });

  it('answers a new key against a full table of refusing windows in well under a millisecond at the real bound', () => {
    const { limiter } = setUp(DEFAULT_MAX_ENTRIES);
    for (let key = 0; key < DEFAULT_MAX_ENTRIES; key += 1) {
      hitTimes(limiter, CHEAP, `held-${key}`, 1);
    }
    const started = performance.now();
    for (let n = 0; n < 1_000; n += 1) {
      expect(limiter.hit(CHEAP, `newcomer-${n}`).allowed).toBe(false);
    }
    const perHitMs = (performance.now() - started) / 1_000;
    expect(perHitMs).toBeLessThan(1);
  });
});
