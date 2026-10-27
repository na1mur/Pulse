// Spec 9.2: one deadline covers the whole shutdown, so the steps cannot add up past it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShutdownDeadline } from './shutdown-deadline.js';

describe('ShutdownDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the fallback until a shutdown has started', () => {
    expect(new ShutdownDeadline().remainingMs(8_000)).toBe(8_000);
  });

  it('counts down from the start and never goes below zero', () => {
    vi.useFakeTimers();
    const deadline = new ShutdownDeadline();
    deadline.start(8_000);
    vi.advanceTimersByTime(6_000);
    expect(deadline.remainingMs(99)).toBe(2_000);
    vi.advanceTimersByTime(5_000);
    expect(deadline.remainingMs(99)).toBe(0);
  });

  it('keeps the first deadline when started again', () => {
    vi.useFakeTimers();
    const deadline = new ShutdownDeadline();
    deadline.start(1_000);
    vi.advanceTimersByTime(400);
    deadline.start(5_000);
    expect(deadline.remainingMs(99)).toBe(600);
  });
});
