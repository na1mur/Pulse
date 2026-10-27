import { randomBytes } from 'node:crypto';

/**
 * A random 256-bit token as URL-safe base64 (43 characters): what refresh credentials and email
 * links carry. Never stored as it is; only `hashEmailToken` / `hashRefreshToken` of it is.
 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
