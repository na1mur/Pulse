import type { Temporal } from 'temporal-polyfill';

/**
 * ADR-0004: the only way server code reads "now" (the server owns the clock, spec principle 2).
 * Full precision; time math in src/domain/time floors to whole seconds and takes `now` as an
 * argument. Inject with `@Inject(CLOCK)`; tests override the provider with a FakeClock.
 */
export interface Clock {
  now(): Temporal.Instant;
}

/** Nest injection token for the Clock (an interface has no runtime value to inject by). */
export const CLOCK = Symbol('Clock');
