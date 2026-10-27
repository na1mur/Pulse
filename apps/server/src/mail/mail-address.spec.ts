// OPS-07: an address ends up in an SMTP envelope and a To header, so only plain addresses pass.
import { describe, expect, it } from 'vitest';
import { isSafeMailAddress } from './mail-address.js';

describe('isSafeMailAddress (OPS-07, header-injection safe)', () => {
  it.each([
    'user@example.org',
    'first.last@sub.example.co',
    'user+tag@example.org',
    "o'brien@example.org",
    'a@b.co',
    'USER@EXAMPLE.ORG',
    'user_1-x@mail-host.example.org',
  ])('accepts the plain address %s', (address) => {
    expect(isSafeMailAddress(address)).toBe(true);
  });

  it.each([
    ['a line break and a second header', 'a@example.org\r\nBcc: evil@example.org'],
    ['a bare line feed', 'a@example.org\nX-Injected: yes'],
    ['a bare carriage return', 'a@example.org\rX-Injected: yes'],
    ['a line break in the local part', 'a\r\nBcc: evil@example.org@example.org'],
    ['a NUL byte', 'a\u0000@example.org'],
    ['a tab', 'a\t@example.org'],
    ['a second recipient after a comma', 'a@example.org,evil@example.org'],
    ['a second recipient after a semicolon', 'a@example.org;evil@example.org'],
    ['a display name', 'Eve <a@example.org>'],
    ['angle brackets', '<a@example.org>'],
    ['a quoted local part', '"a b"@example.org'],
    ['a space in the local part', 'a b@example.org'],
    ['a trailing space', 'a@example.org '],
    ['two @ signs', 'a@@example.org'],
    ['two @ signs apart', 'a@b@example.org'],
    ['no @', 'example.org'],
    ['an empty local part', '@example.org'],
    ['an empty domain', 'a@'],
    ['a domain without a dot', 'a@localhost'],
    ['a domain label that starts with a hyphen', 'a@-example.org'],
    ['an IP-literal domain', 'a@[127.0.0.1]'],
    ['a local part starting with a dot', '.a@example.org'],
    ['a local part ending with a dot', 'a.@example.org'],
    ['consecutive dots', 'a..b@example.org'],
    ['a non-ASCII letter', 'ü@example.org'],
    ['a non-ASCII domain', 'a@exämple.org'],
    ['a local part over 64 characters', `${'a'.repeat(65)}@example.org`],
    [
      'an address over 254 characters',
      `a@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.${'e'.repeat(62)}.org`,
    ],
    ['an empty string', ''],
  ])('rejects %s', (_label, address) => {
    expect(isSafeMailAddress(address)).toBe(false);
  });

  it('rejects a value that is not a string', () => {
    expect(isSafeMailAddress(undefined as unknown as string)).toBe(false);
    expect(isSafeMailAddress(42 as unknown as string)).toBe(false);
  });
});
