import { createHash, createHmac } from 'node:crypto';

/**
 * The SHA-256 of an email token (32 bytes, the `email_tokens.token_hash` column). The token has
 * 256 bits of entropy, so an unsalted, unkeyed hash is enough: it only has to stop a leaked table
 * from being a list of working links.
 */
export function hashEmailToken(token: string): Buffer {
  return createHash('sha256').update('pulse-email-token:').update(token).digest();
}

/**
 * The HMAC-SHA-256 of a refresh credential under `REFRESH_SECRET` (`credentials.token_hash`).
 * Keyed, so a leaked table without the secret cannot even be used to test guesses, and domain
 * separated from the email hash.
 */
export function hashRefreshToken(secret: string, token: string): Buffer {
  return createHmac('sha256', secret).update('pulse-refresh-token:').update(token).digest();
}
