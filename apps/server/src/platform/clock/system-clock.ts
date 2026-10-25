import { Temporal } from 'temporal-polyfill';
import type { Clock } from './clock.js';

/** The real clock: the host's current instant. */
export class SystemClock implements Clock {
  now(): Temporal.Instant {
    return Temporal.Now.instant();
  }
}
