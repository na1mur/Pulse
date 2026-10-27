import { Temporal } from 'temporal-polyfill';

/**
 * R-03: the instant a command counts as happening. Online commands carry none and take server
 * time (`now`). A command replayed from the offline queue carries the device's occurred-at, which
 * is used as long as it lies within what is possible: no later than `now`, no earlier than
 * `notBefore` (for a first sign-in the account's creation; sessions use the end of the previous
 * one). An occurred-at outside the range is clamped to it; one that cannot be read counts as
 * absent. Never throws: a device with a wrong clock must not lose its command.
 */
export function commandInstant(
  occurredAt: string | undefined,
  now: Temporal.Instant,
  notBefore: Temporal.Instant,
): Temporal.Instant {
  if (occurredAt === undefined) return now;
  let claimed: Temporal.Instant;
  try {
    claimed = Temporal.Instant.from(occurredAt);
  } catch {
    return now;
  }
  if (Temporal.Instant.compare(claimed, now) > 0) return now;
  if (Temporal.Instant.compare(claimed, notBefore) < 0) {
    // The floor itself can lie after `now` only if the server clock went backwards.
    return Temporal.Instant.compare(notBefore, now) > 0 ? now : notBefore;
  }
  return claimed;
}
