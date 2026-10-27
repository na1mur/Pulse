// OPS-03: weak and placeholder secrets are refused.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { weakSecretReason } from './secrets.js';

describe('weakSecretReason (OPS-03)', () => {
  it.each([
    'changeme',
    'change-me-to-a-long-random-string-1',
    'CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME',
    'your-jwt-secret-goes-here-please-ok',
    'your_secret_here_and_more_text_here',
    'replace-me-with-something-random-123',
    'this-is-a-secret-value-for-the-server',
    'password-password-password-password',
    'default-default-default-default-default',
    'example-example-example-example-example',
    'placeholder-placeholder-placeholder',
    '<generate-a-random-value-please-ok>',
    '${JWT_SECRET}-from-the-environment-ok',
    '12345678901234567890123456789012',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'abababababababababababababababababab',
    ' leading-space-k3Qv9xT2mWz7LrB4nPd8HsY1',
  ])('rejects %j', (value) => {
    expect(weakSecretReason(value, 32)).toBeTypeOf('string');
  });

  it('rejects a secret shorter than the minimum, whatever it is made of', () => {
    expect(weakSecretReason('k3Qv9xT2mWz7LrB4', 32)).toMatch(/shorter than 32/);
    expect(weakSecretReason('k3Qv9xT2mWz7LrB4', 16)).toBeUndefined();
  });

  it('accepts random secrets', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(weakSecretReason(randomBytes(32).toString('base64url'), 32)).toBeUndefined();
      expect(weakSecretReason(randomBytes(24).toString('hex'), 32)).toBeUndefined();
    }
  });

  it('never repeats the value in the reason', () => {
    const value = 'changeme-and-other-text-for-length-xyz';
    expect(weakSecretReason(value, 32)).not.toContain('changeme-and');
  });
});
