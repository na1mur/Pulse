import { isIPv4, isIPv6 } from 'node:net';

const HEXTETS = 8;
// One customer usually holds a whole /64, so counting single IPv6 addresses would let one client
// rotate through 2^64 of them. The first four hextets are the client.
const PREFIX_HEXTETS = 4;

// `::ffff:203.0.113.7` ends in a dotted quad, which stands for the last two hextets.
function withoutDottedQuad(address: string): string {
  const lastColon = address.lastIndexOf(':');
  const quad = address.slice(lastColon + 1);
  if (!isIPv4(quad)) return address;
  const [a = 0, b = 0, c = 0, d = 0] = quad.split('.').map(Number);
  const hextet = (high: number, low: number): string => ((high << 8) | low).toString(16);
  return `${address.slice(0, lastColon + 1)}${hextet(a, b)}:${hextet(c, d)}`;
}

function expandIpv6(address: string): number[] | undefined {
  const [head = '', tail, extra] = withoutDottedQuad(address).split('::');
  if (extra !== undefined) return undefined;
  const parse = (part: string): number[] =>
    part === '' ? [] : part.split(':').map((hextet) => Number.parseInt(hextet, 16));
  const first = parse(head);
  if (tail === undefined) return first.length === HEXTETS ? first : undefined;
  const last = parse(tail);
  const missing = HEXTETS - first.length - last.length;
  return missing < 1 ? undefined : [...first, ...new Array<number>(missing).fill(0), ...last];
}

function mappedIpv4(hextets: readonly number[]): string | undefined {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, high = 0, low = 0] = hextets;
  if (a !== 0 || b !== 0 || c !== 0 || d !== 0 || e !== 0 || f !== 0xffff) return undefined;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * The identity a per-client rate limit counts for a peer address (`request.ip`, which already
 * accounts for TRUST_PROXY): an IPv4 address as it is, an IPv4-mapped IPv6 address as its IPv4,
 * any other IPv6 address as its /64. Anything that is not exactly one address shares the bucket
 * `unknown`, which fails safe: such clients limit each other, they never escape the limit.
 */
export function ipKey(address: string | undefined): string {
  if (address === undefined) return 'unknown';
  const bare = address.split('%')[0] ?? '';
  if (isIPv4(bare)) return bare;
  if (!isIPv6(bare)) return 'unknown';
  const hextets = expandIpv6(bare);
  if (hextets === undefined) return 'unknown';
  const ipv4 = mappedIpv4(hextets);
  if (ipv4 !== undefined) return ipv4;
  return `${hextets
    .slice(0, PREFIX_HEXTETS)
    .map((hextet) => hextet.toString(16))
    .join(':')}::/64`;
}
