import { describe, expect, it } from 'vitest';
import { canonicalTimeZone } from './time-zone.js';

describe('canonicalTimeZone (R-09, R-15: zones are stored as IANA names)', () => {
  it('returns the IANA spelling of a name written in another case', () => {
    expect(canonicalTimeZone('asia/dhaka')).toBe('Asia/Dhaka');
    expect(canonicalTimeZone('AMERICA/NEW_YORK')).toBe('America/New_York');
    expect(canonicalTimeZone('utc')).toBe('UTC');
  });

  it('keeps a name that is already canonical', () => {
    expect(canonicalTimeZone('Europe/London')).toBe('Europe/London');
    expect(canonicalTimeZone('Etc/GMT+5')).toBe('Etc/GMT+5');
  });

  it('refuses unknown names, offsets and anything with surrounding characters', () => {
    expect(canonicalTimeZone('Mars/Olympus_Mons')).toBeUndefined();
    expect(canonicalTimeZone('+02:00')).toBeUndefined();
    expect(canonicalTimeZone(' Asia/Dhaka')).toBeUndefined();
    expect(canonicalTimeZone('Asia/Dhaka\n')).toBeUndefined();
    expect(canonicalTimeZone('')).toBeUndefined();
  });
});
