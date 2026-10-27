import { describe, expect, it } from 'vitest';
import { normalizeTagName, tagNameKey } from './tag-name.js';

describe('tag names (R-29)', () => {
  it('trims and collapses internal whitespace to single spaces, keeping the casing', () => {
    expect(normalizeTagName('  Deep \t  Work\n')).toBe('Deep Work');
  });

  it('keys by NFKC and lower case, so look-alike names collide', () => {
    expect(tagNameKey('Deep Work')).toBe('deep work');
    expect(tagNameKey('  DEEP   work ')).toBe('deep work');
    expect(tagNameKey('ＤＥＥＰ Work')).toBe('deep work');
    expect(tagNameKey('Café')).toBe(tagNameKey('Café'));
  });
});
