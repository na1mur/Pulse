import { Temporal } from 'temporal-polyfill';
import type { Clock } from './clock.js';

/**
 * A clock for tests: stands still at the instant it was given until it is set or advanced. Not
 * provided by ClockModule; tests swap it in with `overrideProvider(CLOCK).useValue(fake)`.
 */
export class FakeClock implements Clock {
  private current: Temporal.Instant;

  constructor(instant: Temporal.Instant | string) {
    this.current = Temporal.Instant.from(instant);
  }

  now(): Temporal.Instant {
    return this.current;
  }

  set(instant: Temporal.Instant | string): void {
    this.current = Temporal.Instant.from(instant);
  }

  /** Moves forward by an exact duration (hours and smaller units; days are not fixed-length). */
  advance(duration: Temporal.DurationLike): void {
    this.current = this.current.add(duration);
  }
}
