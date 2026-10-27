import { createHash } from 'node:crypto';
import type { RateRule } from '../../platform/rate-limit/rate-limiter.js';

const MINUTE = 60_000;

/**
 * Spec 9.1 and Appendix A: rate limits on the auth operations, per client (the IP, see
 * `ClientKey`) and per account. Counted in memory by the `RateLimiter`. The numbers favour a
 * household sharing one address (D-11) over a public service: ten sign-up attempts an hour and
 * thirty sign-in attempts per quarter hour per address, ten failed passwords per quarter hour
 * per account.
 */
export const AUTH_LIMITS = {
  registerPerClient: { name: 'register-client', limit: 10, windowMs: 60 * MINUTE },
  verifyPerClient: { name: 'verify-client', limit: 30, windowMs: 15 * MINUTE },
  /** AUTH-10: the verification email can be asked for once a minute per account. */
  resendPerAccount: { name: 'resend-account', limit: 1, windowMs: MINUTE },
  resendPerClient: { name: 'resend-client', limit: 10, windowMs: 60 * MINUTE },
  loginPerClient: { name: 'login-client', limit: 30, windowMs: 15 * MINUTE },
  /** Counts every sign-in attempt on the account when it starts; the right password clears it. */
  loginFailuresPerAccount: { name: 'login-failures-account', limit: 10, windowMs: 15 * MINUTE },
  refreshPerClient: { name: 'refresh-client', limit: 60, windowMs: 15 * MINUTE },
} as const satisfies Record<string, RateRule>;

/**
 * The key an account's limits count under: a fixed-size hash of the folded address (`emailKey`),
 * so differently written spellings of one address share one counter, and a 4 000-character
 * address cannot bloat the table.
 */
export function accountLimitKey(emailKeyValue: string): string {
  return createHash('sha256').update(emailKeyValue).digest('hex').slice(0, 32);
}
