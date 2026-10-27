import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashEmailToken, hashRefreshToken } from './tokens.js';

const sampleToken = (): string => randomBytes(32).toString('base64url');

const SECRET = 'Vb5Nq0Zt8XcR2mLk7Wd4Hs9YfJ1GuPeA';

describe('tokens', () => {
  it('hashes an email token to 32 bytes, the same way every time, and not to itself', () => {
    const token = sampleToken();
    const hash = hashEmailToken(token);
    expect(hash).toHaveLength(32);
    expect(hash.equals(hashEmailToken(token))).toBe(true);
    expect(hash.equals(hashEmailToken(`${token}x`))).toBe(false);
    expect(hash.toString('base64url')).not.toContain(token.slice(0, 8));
  });

  it('keys the refresh hash with the secret: another secret gives another hash', () => {
    const token = sampleToken();
    const hash = hashRefreshToken(SECRET, token);
    expect(hash).toHaveLength(32);
    expect(hash.equals(hashRefreshToken(SECRET, token))).toBe(true);
    expect(hash.equals(hashRefreshToken(`${SECRET}x`, token))).toBe(false);
    // A refresh hash is not an email-token hash: a stolen table row cannot be replayed as either.
    expect(hash.equals(hashEmailToken(token))).toBe(false);
  });
});
