import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdUntil } from './hold-until.js';

describe('holdUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for what is left of the floor, not the whole floor', async () => {
    const startedAt = performance.now();
    vi.advanceTimersByTime(60);
    let done = false;
    const held = holdUntil(startedAt, 200).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(139);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await held;
    expect(done).toBe(true);
  });

  it('returns at once when the work already took longer than the floor', async () => {
    const startedAt = performance.now();
    vi.advanceTimersByTime(500);
    let done = false;
    const held = holdUntil(startedAt, 200).then(() => {
      done = true;
    });
    await Promise.resolve();
    await held;
    expect(done).toBe(true);
  });

  it('does not wait at all for a floor of zero', async () => {
    await expect(holdUntil(performance.now(), 0)).resolves.toBeUndefined();
  });
});
