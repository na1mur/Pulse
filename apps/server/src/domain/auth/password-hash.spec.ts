import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PASSWORD_SALT_BYTES,
  hashPassword,
  verifyPassword,
  type PasswordHashParameters,
} from './password-hash.js';

// The domain takes the salt as an argument (it holds no randomness); tests draw one per hash.
const salt = (): Buffer => randomBytes(PASSWORD_SALT_BYTES);

// Cheap parameters keep the unit tests fast; the format and the stored-parameter rule are the same.
const CHEAP: PasswordHashParameters = { memoryKib: 64, passes: 1, parallelism: 1 };

describe('password hashing (spec 9.1: Argon2id)', () => {
  it('stores Argon2id in the PHC string format with its parameters and the salt it was given', async () => {
    const given = salt();
    const hash = await hashPassword('correct horse battery staple', given);
    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(hash.split('$')[4]).toBe(given.toString('base64').replace(/=+$/, ''));
    expect(hash.length).toBeLessThanOrEqual(512);
  });

  it('is a function of password and salt: the same pair gives the same hash, another salt another', async () => {
    const given = salt();
    const hash = await hashPassword('correct horse battery staple', given, CHEAP);
    expect(await hashPassword('correct horse battery staple', given, CHEAP)).toBe(hash);
    expect(await hashPassword('correct horse battery staple', salt(), CHEAP)).not.toBe(hash);
  });

  it('never contains the password', async () => {
    const hash = await hashPassword('hunter2hunter2', salt(), CHEAP);
    expect(hash).not.toContain('hunter2');
    expect(Buffer.from(hash).toString('latin1')).not.toContain('hunter2hunter2');
  });

  it('verifies the right password and refuses a wrong one, including near misses', async () => {
    const hash = await hashPassword('Tr0ub4dor&3', salt(), CHEAP);
    expect(await verifyPassword('Tr0ub4dor&3', hash)).toBe(true);
    expect(await verifyPassword('Tr0ub4dor&4', hash)).toBe(false);
    expect(await verifyPassword('tr0ub4dor&3', hash)).toBe(false);
    expect(await verifyPassword('Tr0ub4dor&3 ', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('verifies with the parameters stored in the hash, so parameters can be raised later', async () => {
    const old = await hashPassword('same password 1', salt(), {
      memoryKib: 32,
      passes: 1,
      parallelism: 1,
    });
    const newer = await hashPassword('same password 1', salt(), {
      memoryKib: 128,
      passes: 2,
      parallelism: 2,
    });
    expect(await verifyPassword('same password 1', old)).toBe(true);
    expect(await verifyPassword('same password 1', newer)).toBe(true);
  });

  it('handles any Unicode and the full 128-character length', async () => {
    const password = '\u{1F512}pässwörd'.padEnd(128, 'ß');
    const hash = await hashPassword(password, salt(), CHEAP);
    expect(await verifyPassword(password, hash)).toBe(true);
    // No normalisation: a different Unicode form is a different password.
    expect(await verifyPassword(password.normalize('NFD'), hash)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['not PHC', 'plaintext'],
    [
      'another algorithm',
      '$argon2i$v=19$m=64,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
    [
      'another version',
      '$argon2id$v=16$m=64,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
    [
      'missing parameter',
      '$argon2id$v=19$m=64,t=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
    [
      'extra parameter',
      '$argon2id$v=19$m=64,t=1,p=1,x=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
    [
      'memory bomb',
      '$argon2id$v=19$m=4294967295,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
    [
      'pass bomb',
      '$argon2id$v=19$m=64,t=4294967295,p=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
    [
      'zero passes',
      '$argon2id$v=19$m=64,t=0,p=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
    ['short salt', '$argon2id$v=19$m=64,t=1,p=1$YWJj$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['empty hash', '$argon2id$v=19$m=64,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$'],
  ])('refuses a malformed or unsafe stored hash (%s) without throwing', async (_name, stored) => {
    await expect(verifyPassword('anything goes', stored)).resolves.toBe(false);
  });

  it('does not block the event loop while it hashes, for hashing and verifying alike', async () => {
    // Node 24.0-24.15 ran the whole Argon2 derivation once on the main thread before queueing
    // the real job (nodejs/node#62861, fixed in 24.16.0): every sign-in and sign-up stalled every
    // other request for one hash. Compared as a ratio of the same call's total time, so load
    // stretches both sides: about 0.5 on an affected Node, under 0.05 on a fixed one. Minimums
    // of several samples, so a slow outlier never decides.
    const stored = await hashPassword('the right password', salt());
    const sample = async (
      work: () => Promise<unknown>,
    ): Promise<{ sync: number; total: number }> => {
      const started = performance.now();
      const pending = work();
      const sync = performance.now() - started;
      await pending;
      return { sync, total: performance.now() - started };
    };
    for (const work of [
      () => hashPassword('a long enough password', salt()),
      () => verifyPassword('a wrong password', stored),
    ]) {
      const samples: { sync: number; total: number }[] = [];
      for (let round = 0; round < 5; round += 1) samples.push(await sample(work));
      const minSync = Math.min(...samples.map((s) => s.sync));
      const minTotal = Math.min(...samples.map((s) => s.total));
      expect(minSync / minTotal).toBeLessThan(0.25);
    }
  });
});
