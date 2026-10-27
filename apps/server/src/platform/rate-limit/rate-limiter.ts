import { Inject, Injectable, Optional } from '@nestjs/common';
import { CLOCK, type Clock } from '../clock/clock.js';
import { AppError } from '../errors/app-error.js';

/** One limit: at most `limit` counted events per `windowMs` for each key. */
export interface RateRule {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
}

export type RateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

interface Window {
  count: number;
  endsAt: number;
}

/** Windows held per rule at most. */
export const DEFAULT_MAX_ENTRIES = 10_000;
/** Injection token for the bound; tests set a small one. */
export const RATE_LIMIT_MAX_ENTRIES = Symbol('RateLimitMaxEntries');

/**
 * Fixed-window counters in memory (spec 9.1: rate limits per IP and per account on the auth
 * operations). Deliberately small: one process serves one household of users (D-11), a restart
 * forgets the counters (a restart is not a way to brute-force more than one window's worth
 * per restart), and there is no external store to run. Time comes from the injected clock.
 *
 * Bounded, without letting the bound lift a limit (QA T1.5 bug 2). Each rule has its own table of
 * at most `maxEntries` windows, so a flood of cheap keys for one rule (resend requests for random
 * addresses from rotating IPv6 /64s) cannot push out another rule's windows (an account's failed
 * passwords). A full table makes room by dropping expired windows, then the least used window
 * that is still under its limit (lowest count, oldest first). A window at its limit is never
 * dropped: when every window of the rule is at its limit, a new key is refused until the earliest
 * window ends. That fails closed: the flood can make an operation answer 429 to newcomers for at
 * most one window, but can never unblock an account or a client, and it costs the attacker
 * `maxEntries` times the rule's limit in counted requests. Callers pass hashed or short keys.
 */
@Injectable()
export class RateLimiter {
  private readonly tables = new Map<string, Map<string, Window>>();

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional()
    @Inject(RATE_LIMIT_MAX_ENTRIES)
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  /** Number of windows held over all rules (for tests and diagnostics). */
  get size(): number {
    let total = 0;
    for (const table of this.tables.values()) total += table.size;
    return total;
  }

  /**
   * Counts one event for `key` when the rule allows it. Checking and counting are one synchronous
   * step, so concurrent requests cannot all pass a check before any of them is counted. Refused
   * events are not counted, so hammering cannot extend a window.
   */
  hit(rule: RateRule, key: string): RateDecision {
    const now = this.clock.now().epochMilliseconds;
    const table = this.tableOf(rule);
    const current = table.get(key);
    if (current !== undefined && now < current.endsAt) {
      if (current.count >= rule.limit) return refused(current, now);
      current.count += 1;
      return { allowed: true };
    }
    if (current !== undefined) {
      table.delete(key);
    } else if (table.size >= this.maxEntries) {
      const blockedUntil = makeRoom(table, now, rule.limit);
      if (blockedUntil !== undefined) return refused(blockedUntil, now);
    }
    table.set(key, { count: 1, endsAt: now + rule.windowMs });
    return { allowed: true };
  }

  /** Counts one event and throws RATE_LIMITED (with `Retry-After`) when it is over the limit. */
  enforce(rule: RateRule, key: string): void {
    const decision = this.hit(rule, key);
    if (!decision.allowed) throw rateLimited(decision.retryAfterSeconds);
  }

  /** Forgets `key` (a successful sign-in clears that account's failed attempts). */
  reset(rule: RateRule, key: string): void {
    this.tables.get(rule.name)?.delete(key);
  }

  private tableOf(rule: RateRule): Map<string, Window> {
    let table = this.tables.get(rule.name);
    if (table === undefined) {
      table = new Map();
      this.tables.set(rule.name, table);
    }
    return table;
  }
}

/**
 * Frees one place in a full table, or answers the window whose end frees the first one when every
 * window is at its limit (nothing may be dropped then). See the class note for the order.
 */
function makeRoom(table: Map<string, Window>, now: number, limit: number): Window | undefined {
  let expired = false;
  let leastUsed: [string, Window] | undefined;
  let endsFirst: Window | undefined;
  for (const entry of table) {
    const [key, window] = entry;
    if (now >= window.endsAt) {
      table.delete(key);
      expired = true;
    } else if (window.count < limit) {
      if (leastUsed === undefined || window.count < leastUsed[1].count) leastUsed = entry;
    } else if (endsFirst === undefined || window.endsAt < endsFirst.endsAt) {
      endsFirst = window;
    }
  }
  if (expired) return undefined;
  if (leastUsed !== undefined) {
    table.delete(leastUsed[0]);
    return undefined;
  }
  return endsFirst;
}

function refused(window: Window, now: number): RateDecision {
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((window.endsAt - now) / 1000)),
  };
}

function rateLimited(retryAfterSeconds: number): AppError {
  return new AppError('RATE_LIMITED', 'Too many requests. Try again later.', {
    retryAfterSeconds,
  });
}
