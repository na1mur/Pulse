import { describe, expect, it } from 'vitest';
import { emailKey } from './email-key.js';

describe('emailKey', () => {
  it.each([
    ['Ada@Example.TEST', 'ada@example.test'],
    ['  ada@example.test \t\n', 'ada@example.test'],
    // Locale-independent folding of non-ASCII letters.
    ['JÉRÔME@example.test', 'jérôme@example.test'],
    ['ИВАН@example.test', 'иван@example.test'],
    ['ΣΟΦΊΑ@example.test', 'σοφία@example.test'],
    ['STRAẞE@example.test', 'straße@example.test'],
    // NFKC: fullwidth letters, the Kelvin sign and ligatures fold to their plain letters.
    ['ＡＤＡ＠example.test', 'ada@example.test'],
    ['\u212Aate@example.test', 'kate@example.test'],
    ['\uFB01nn@example.test', 'finn@example.test'],
  ])('maps %j to %j', (email, key) => {
    expect(emailKey(email)).toBe(key);
  });

  it('gives composed and decomposed accents the same key', () => {
    expect(emailKey('caf\u00E9@example.test')).toBe(emailKey('cafe\u0301@example.test'));
  });

  it('gives case variants the same key and different addresses different keys', () => {
    expect(emailKey('Ivan@Example.test')).toBe(emailKey('iVAN@example.TEST'));
    expect(emailKey('ivan@example.test')).not.toBe(emailKey('ivan2@example.test'));
  });

  it('is idempotent', () => {
    for (const email of ['JÉRÔME@Example.test', '\u212A@x.test', ' ＡＢ@x.test ']) {
      expect(emailKey(emailKey(email))).toBe(emailKey(email));
    }
  });

  it('can grow a character at most 18-fold, which the users.email_key length check allows', () => {
    // U+FDFA expands to 18 characters under NFKC, the largest expansion in Unicode.
    expect(emailKey('\uFDFA')).toHaveLength(18);
  });
});
