import { describe, expect, it } from 'vitest';
import { ipKey } from './ip-key.js';

describe('ipKey (the client identity a rate limit counts)', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(ipKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('reads an IPv4-mapped IPv6 address as the IPv4 address, in either notation', () => {
    expect(ipKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipKey('::ffff:cb00:7107')).toBe('203.0.113.7');
  });

  it('counts a whole /64 as one client, because one customer holds a whole /64', () => {
    const a = ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = ipKey('2001:0DB8:0001:0002:0000:0000:0000:0001');
    const c = ipKey('2001:db8:1:2::9');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(ipKey('2001:db8:1:3::9')).not.toBe(a);
  });

  it('expands :: in any position before taking the prefix', () => {
    expect(ipKey('::1')).toBe(ipKey('0:0:0:0:0:0:0:2'));
    expect(ipKey('2001:db8::1')).toBe(ipKey('2001:db8:0:0::ffff'));
    expect(ipKey('2001:db8:1:2::')).toBe(ipKey('2001:db8:1:2:1::'));
  });

  it('ignores an IPv6 zone', () => {
    expect(ipKey('fe80::1%eth0')).toBe(ipKey('fe80::2'));
  });

  it('puts an unknown or malformed address in one shared bucket instead of throwing', () => {
    expect(ipKey(undefined)).toBe('unknown');
    expect(ipKey('')).toBe('unknown');
    expect(ipKey('not an ip')).toBe('unknown');
    expect(ipKey('1.2.3.4, 5.6.7.8')).toBe('unknown');
    expect(ipKey('2001:db8::1::2')).toBe('unknown');
  });
});
