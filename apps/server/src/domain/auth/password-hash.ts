import { argon2, timingSafeEqual, type Argon2Parameters } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2) as (
  algorithm: 'argon2id',
  parameters: Argon2Parameters,
) => Promise<Buffer>;

export interface PasswordHashParameters {
  readonly memoryKib: number;
  readonly passes: number;
  readonly parallelism: number;
}

/**
 * Spec 9.1: Argon2id, with the OWASP minimum configuration (19 MiB, 2 passes, 1 lane): about 50 ms
 * and 19 MiB per hash on a laptop. Every sign-in and sign-up pays it, so it is also what the rate
 * limits protect (and the 4-thread pool Node runs it on).
 */
export const PASSWORD_HASH_PARAMETERS: PasswordHashParameters = {
  memoryKib: 19_456,
  passes: 2,
  parallelism: 1,
};

/** Salt length for new hashes (OWASP: at least 16 bytes); the caller draws it at random. */
export const PASSWORD_SALT_BYTES = 16;

const VERSION = 19;
const HASH_BYTES = 32;
// What a stored hash may ask of the server when it is verified. A row is trusted data, but a
// restored or edited one must not be able to ask for gigabytes of memory.
const LIMITS = {
  memoryKib: { min: 8, max: 262_144 },
  passes: { min: 1, max: 10 },
  parallelism: { min: 1, max: 4 },
  salt: { min: 8, max: 64 },
  hash: { min: 16, max: 64 },
};

const PHC = /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const withinLimits = (value: number, { min, max }: { min: number; max: number }): boolean =>
  Number.isSafeInteger(value) && value >= min && value <= max;

// Unpadded standard base64, as PHC strings write it.
const encode = (bytes: Buffer): string => bytes.toString('base64').replace(/=+$/, '');
const decode = (text: string): Buffer => Buffer.from(text, 'base64');

function derive(
  password: string,
  salt: Buffer,
  { memoryKib, passes, parallelism }: PasswordHashParameters,
  hashBytes: number,
): Promise<Buffer> {
  return argon2Async('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    memory: memoryKib,
    passes,
    parallelism,
    tagLength: hashBytes,
  });
}

/**
 * A PHC string (`$argon2id$v=19$m=..,t=..,p=..$salt$hash`) of `password` with `salt`. Pure: the
 * caller draws a fresh random salt of `PASSWORD_SALT_BYTES` for every hash (`PasswordHasher`).
 */
export async function hashPassword(
  password: string,
  salt: Buffer,
  parameters: PasswordHashParameters = PASSWORD_HASH_PARAMETERS,
): Promise<string> {
  const hash = await derive(password, salt, parameters, HASH_BYTES);
  const { memoryKib, passes, parallelism } = parameters;
  return `$argon2id$v=${VERSION}$m=${memoryKib},t=${passes},p=${parallelism}$${encode(salt)}$${encode(hash)}`;
}

/**
 * True when `password` produces `stored`. Uses the parameters written in the hash, compares in
 * constant time, and answers false (never throws) for anything that is not a well-formed
 * Argon2id hash within limits.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (match === null) return false;
  const [version, memoryKib, passes, parallelism] = match.slice(1, 5).map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const salt = decode(match[5] ?? '');
  const expected = decode(match[6] ?? '');
  const valid =
    version === VERSION &&
    withinLimits(memoryKib, LIMITS.memoryKib) &&
    withinLimits(passes, LIMITS.passes) &&
    withinLimits(parallelism, LIMITS.parallelism) &&
    // Argon2 needs memory of at least 8 blocks per lane.
    memoryKib >= 8 * parallelism &&
    withinLimits(salt.length, LIMITS.salt) &&
    withinLimits(expected.length, LIMITS.hash);
  if (!valid) return false;
  const actual = await derive(password, salt, { memoryKib, passes, parallelism }, expected.length);
  return timingSafeEqual(actual, expected);
}
