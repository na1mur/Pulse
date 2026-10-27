import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock/fake-clock.js';
import { RateLimiter, type RateRule } from './rate-limiter.js';

const START = '2026-10-27T10:00:00Z';
const ONCE_A_MINUTE: RateRule = { name: 'resend', limit: 1, windowMs: 60_000 };
const THREE_PER_TEN_SECONDS: RateRule = { name: 'burst', limit: 3, windowMs: 10_000 };

function limiter(maxEntries?: number): { clock: FakeClock; limiter: RateLimiter } {
  const clock = new FakeClock(START);
  return { clock, limiter: new RateLimiter(clock, maxEntries) };
}

describe('RateLimiter', () => {
  it('allows up to the limit in a window, then refuses with the time left', () => {
    const { clock, limiter: limits } = limiter();
    expect(limits.hit(THREE_PER_TEN_SECONDS, 'a').allowed).toBe(true);
    expect(limits.hit(THREE_PER_TEN_SECONDS, 'a').allowed).toBe(true);
    clock.advance({ seconds: 4 });
    expect(limits.hit(THREE_PER_TEN_SECONDS, 'a').allowed).toBe(true);
    const refused = limits.hit(THREE_PER_TEN_SECONDS, 'a');
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 6 });
  });

  it('opens a new window exactly when the old one ends, not a millisecond before', () => {
    const { clock, limiter: limits } = limiter();
    expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(true);
    clock.advance({ seconds: 59, milliseconds: 999 });
    expect(limits.hit(ONCE_A_MINUTE, 'a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    clock.advance({ milliseconds: 1 });
    expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(true);
  });

  it('counts refused attempts nowhere: hammering does not extend the window', () => {
    const { clock, limiter: limits } = limiter();
    limits.hit(ONCE_A_MINUTE, 'a');
    for (let attempt = 0; attempt < 50; attempt += 1) {
      clock.advance({ seconds: 1 });
      limits.hit(ONCE_A_MINUTE, 'a');
    }
    clock.advance({ seconds: 10 });
    expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(true);
  });

  it('keeps keys and rules apart', () => {
    const { limiter: limits } = limiter();
    expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(true);
    expect(limits.hit(ONCE_A_MINUTE, 'b').allowed).toBe(true);
    expect(limits.hit({ ...ONCE_A_MINUTE, name: 'other' }, 'a').allowed).toBe(true);
    expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(false);
  });

  it('forgets a key on reset, so its next event opens a new window', () => {
    const { limiter: limits } = limiter();
    limits.hit(ONCE_A_MINUTE, 'a');
    expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(false);
    limits.reset(ONCE_A_MINUTE, 'a');
    expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(true);
  });

  describe('bounded memory that cannot be used to lift a limit (QA T1.5 bug 2)', () => {
    const FAILURES: RateRule = { name: 'failures', limit: 3, windowMs: 15 * 60_000 };

    it('never holds more than its bound per rule, whatever keys arrive', () => {
      const { clock, limiter: limits } = limiter(100);
      for (let key = 0; key < 10_000; key += 1) {
        limits.hit(THREE_PER_TEN_SECONDS, `key-${key}`);
        limits.hit(ONCE_A_MINUTE, `key-${key}`);
        if (key % 1_000 === 0) clock.advance({ seconds: 1 });
      }
      expect(limits.size).toBeLessThanOrEqual(200);
    });

    it('keeps the rules apart: flooding one rule with new keys never evicts a window of another rule', () => {
      const { limiter: limits } = limiter(10);
      for (let attempt = 0; attempt < 3; attempt += 1) limits.hit(FAILURES, 'account');
      expect(limits.hit(FAILURES, 'account').allowed).toBe(false);
      for (let key = 0; key < 1_000; key += 1) limits.hit(THREE_PER_TEN_SECONDS, `flood-${key}`);
      expect(limits.hit(FAILURES, 'account').allowed).toBe(false);
    });

    it('never evicts a window that is refusing, and evicts the least used of the others first', () => {
      const { limiter: limits } = limiter(3);
      for (let attempt = 0; attempt < 3; attempt += 1) limits.hit(FAILURES, 'blocked');
      limits.hit(FAILURES, 'two');
      limits.hit(FAILURES, 'two');
      limits.hit(FAILURES, 'one');
      // Full: the new key takes the place of 'one' (count 1), not of the older 'blocked' or 'two'.
      expect(limits.hit(FAILURES, 'new').allowed).toBe(true);
      expect(limits.size).toBe(3);
      expect(limits.hit(FAILURES, 'blocked').allowed).toBe(false);
      // 'two' kept its count: one more is allowed, then it refuses.
      expect(limits.hit(FAILURES, 'two').allowed).toBe(true);
      expect(limits.hit(FAILURES, 'two').allowed).toBe(false);
    });

    it('refuses a new key while every window of the rule is refusing (fails closed), until one ends', () => {
      const { clock, limiter: limits } = limiter(2);
      limits.hit(ONCE_A_MINUTE, 'a');
      clock.advance({ seconds: 20 });
      limits.hit(ONCE_A_MINUTE, 'b');
      // Both windows are at their limit: nothing may be evicted, so the newcomer waits for the
      // earliest window to end (40 s from now), and the blocked keys stay blocked.
      expect(limits.hit(ONCE_A_MINUTE, 'c')).toEqual({ allowed: false, retryAfterSeconds: 40 });
      expect(limits.hit(ONCE_A_MINUTE, 'a').allowed).toBe(false);
      expect(limits.size).toBe(2);
      clock.advance({ seconds: 40 });
      expect(limits.hit(ONCE_A_MINUTE, 'c').allowed).toBe(true);
      expect(limits.hit(ONCE_A_MINUTE, 'b').allowed).toBe(false);
    });

    it('makes room from expired windows before anything else', () => {
      const { clock, limiter: limits } = limiter(3);
      limits.hit(ONCE_A_MINUTE, 'old-1');
      limits.hit(ONCE_A_MINUTE, 'old-2');
      clock.advance({ minutes: 2 });
      limits.hit(ONCE_A_MINUTE, 'fresh-1');
      limits.hit(ONCE_A_MINUTE, 'fresh-2');
      expect(limits.size).toBe(2);
      expect(limits.hit(ONCE_A_MINUTE, 'fresh-1').allowed).toBe(false);
    });
  });
});
