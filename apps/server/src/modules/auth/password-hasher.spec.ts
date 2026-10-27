import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordHasher } from './password-hasher.js';
import { hashPassword, verifyPassword } from '../../domain/auth/password-hash.js';

// The real implementation, watched: every call is recorded and still does the real work.
vi.mock('../../domain/auth/password-hash.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/auth/password-hash.js')>();
  return {
    ...actual,
    hashPassword: vi.fn(actual.hashPassword),
    verifyPassword: vi.fn(actual.verifyPassword),
  };
});

const hashSpy = vi.mocked(hashPassword);
const verifySpy = vi.mocked(verifyPassword);

async function timed(work: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await work();
  return performance.now() - started;
}

/** The lower quartile: robust against the slow outliers a loaded machine adds. */
const lowerQuartile = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 4)] ?? 0;

afterEach(() => {
  hashSpy.mockClear();
  verifySpy.mockClear();
});

describe('PasswordHasher', () => {
  it('hashes and verifies', async () => {
    const hasher = new PasswordHasher();
    const stored = await hasher.hash('a long enough password');
    expect(await hasher.verify('a long enough password', stored)).toBe(true);
    expect(await hasher.verify('a long enough passwore', stored)).toBe(false);
  });

  describe('"no such account" (spec 9.1: login errors identical including timing)', () => {
    it('really verifies the password against a throwaway hash with the current parameters', async () => {
      // This is the guarantee; the timing test below only corroborates it. A hasher that returns
      // false without hashing fails here deterministically, on any machine, under any load.
      const hasher = new PasswordHasher();
      const real = await hasher.hash('the right password');
      await hasher.verify('some guess', null);
      await hasher.verify('some guess', real);

      expect(verifySpy).toHaveBeenCalledTimes(2);
      const [unknownCall, knownCall] = verifySpy.mock.calls;
      expect(unknownCall?.[0]).toBe('some guess');
      const parametersOf = (hash: string | undefined): string | undefined =>
        /^\$argon2id\$v=19\$(m=\d+,t=\d+,p=\d+)\$/.exec(hash ?? '')?.[1];
      expect(parametersOf(unknownCall?.[1])).toBe('m=19456,t=2,p=1');
      expect(parametersOf(unknownCall?.[1])).toBe(parametersOf(knownCall?.[1]));
      // A hash nobody knows the password of: not the real account's, not a constant.
      expect(unknownCall?.[1]).not.toBe(real);
    });

    it('uses the same throwaway hash every time, made once per process, never a plaintext check', async () => {
      const hasher = new PasswordHasher();
      await hasher.verify('one', null);
      await hasher.verify('two', null);
      expect(verifySpy.mock.calls[0]?.[1]).toBe(verifySpy.mock.calls[1]?.[1]);
      expect(await hasher.verify('the dummy has no known password', null)).toBe(false);
    });

    it('hashes the same password differently every time: a fresh salt per hash', async () => {
      const hasher = new PasswordHasher();
      const first = await hasher.hash('the same password');
      const second = await hasher.hash('the same password');
      expect(first.split('$')[4]).not.toBe(second.split('$')[4]);
      expect(first).not.toBe(second);
    });

    it('makes the throwaway hash while the application starts, not on construction or later', async () => {
      // Verify round 1: made in the constructor, the hash ran unawaited, past app.close() when
      // nothing signed in, and a failure would have been an unhandled rejection.
      const hasher = new PasswordHasher();
      expect(hashSpy).not.toHaveBeenCalled();
      await hasher.onModuleInit();
      expect(hashSpy).toHaveBeenCalledTimes(1);
      await hasher.verify('one', null);
      await hasher.verify('two', null);
      expect(hashSpy).toHaveBeenCalledTimes(1);
    });

    it('also corroborates it by time: the lower quartiles agree within 0.5x to 2x', async () => {
      // The work is one Argon2id hash (about 50 ms) either way. A skipped hash costs about 0 ms,
      // a ratio near 0.02, so this band catches it; the band is wide because a loaded CI machine
      // stretches both paths by an unpredictable factor. Samples alternate so that load hits
      // both equally, and the lower quartile ignores the slow outliers.
      const hasher = new PasswordHasher();
      const stored = await hasher.hash('the right password');
      await hasher.verify('warm up', null);
      const wrong: number[] = [];
      const unknown: number[] = [];
      for (let round = 0; round < 21; round += 1) {
        unknown.push(await timed(() => hasher.verify('a wrong password', null)));
        wrong.push(await timed(() => hasher.verify('a wrong password', stored)));
      }
      const ratio = lowerQuartile(unknown) / lowerQuartile(wrong);
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    });
  });
});
