import { describe, expect, it } from 'vitest';
import { newToken } from './new-token.js';

describe('newToken', () => {
  it('makes 256-bit URL-safe tokens that never repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
