// US-4.3, AUTH-02, AUTH-10 (D-31): signing in. Wrong email and wrong password are the same answer
// in status, body and (within a stated tolerance) time; an unverified account is refused only
// after the right password; limits per client and per account cannot be moved by headers or by
// spelling the address differently.
import { randomUUID } from 'node:crypto';
import { AuthSession } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from '../../domain/auth/password-hash.js';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import {
  PASSWORD,
  containsToken,
  deviceInfo,
  dumpDatabaseText,
  startAuthHarness,
  uniqueEmail,
  type ApiResponse,
  type AuthHarness,
} from './auth.testing.js';

// The real hashing, watched: calls are recorded and still do the real work.
vi.mock('../../domain/auth/password-hash.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/auth/password-hash.js')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});
const verifySpy = vi.mocked(verifyPassword);

/** What a caller can see of an answer, minus what is per request (IDs, times). */
function observable(response: ApiResponse): string {
  const body = response.body as { requestId?: string } | undefined;
  const headers = [...response.headers.keys()].filter((name) => !name.startsWith('pulse-')).sort();
  return JSON.stringify({
    status: response.status,
    text: response.text.replace(body?.requestId ?? '\u0000', '<request id>'),
    headers,
  });
}

/** The lower quartile: robust against the slow outliers a loaded machine adds. */
const lowerQuartile = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 4)] ?? 0;

describe.skipIf(databaseTestsSkipped)('auth.login (US-4.3, AUTH-02, D-31)', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const login = (
    email: string,
    password: string,
    options: { ip?: string | null; deviceId?: string; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse> =>
    h.post(
      '/v1/auth/login',
      { email, password, device: deviceInfo(options.deviceId) },
      {
        ...(options.ip === undefined ? {} : { ip: options.ip }),
        ...(options.headers === undefined ? {} : { headers: options.headers }),
      },
    );

  describe('success', () => {
    it('answers the AuthSession of the contract: 15-minute access, 30-day refresh, the account', async () => {
      const email = await h.verifiedAccount();
      const response = await login(email, PASSWORD);
      expect(response.status).toBe(200);
      const session = AuthSession.parse(response.body);
      expect(session.accessTokenExpiresAt).toBe('2026-10-27T10:15:00.000Z');
      expect(session.refreshTokenExpiresAt).toBe('2026-11-26T10:00:00.000Z');
      expect(session.user).toMatchObject({
        email,
        hasPassword: true,
        googleLinked: false,
      });
      expect(session.user.emailVerifiedAt).not.toBeNull();
      expect(Object.keys(session.user).sort()).toEqual([
        'createdAt',
        'email',
        'emailVerifiedAt',
        'googleLinked',
        'hasPassword',
        'id',
        'updatedAt',
      ]);
    });

    it('records the device and one credential, storing only the hash of the refresh token', async () => {
      const email = await h.verifiedAccount();
      const deviceId = randomUUID();
      const response = await login(email, PASSWORD, { deviceId });
      const { refreshToken, accessToken } = AuthSession.parse(response.body);

      const device = await h.db
        .selectFrom('devices')
        .selectAll()
        .where('id', '=', deviceId)
        .executeTakeFirstOrThrow();
      expect(device).toMatchObject({
        name: 'Test laptop',
        platform: 'windows',
        app_version: '1.0.0',
      });
      const credentials = await h.db
        .selectFrom('credentials')
        .selectAll()
        .where('device_id', '=', deviceId)
        .execute();
      expect(credentials).toHaveLength(1);
      expect(credentials[0]?.token_hash).toHaveLength(32);
      expect(credentials[0]?.revoked_at).toBeNull();
      expect(credentials[0]?.expires_at.toISOString()).toBe('2026-11-26T10:00:00.000Z');

      const stored = await dumpDatabaseText(h.db);
      expect(containsToken(stored, refreshToken)).toBe(false);
      expect(stored).not.toContain(accessToken);
      expect(stored).not.toContain(PASSWORD);
      expect(h.logs.length).toBeGreaterThan(0); // what is absent below was written to
      const logs = h.logs.join('\n');
      expect(containsToken(logs, refreshToken)).toBe(false);
      expect(logs).not.toContain(accessToken);
      expect(logs).not.toContain(PASSWORD);
      expect(logs).not.toContain(email);
    });

    it('accepts the address in any spelling the account was folded from', async () => {
      const email = await h.verifiedAccount(uniqueEmail('Mixed'));
      expect((await login(email.toUpperCase(), PASSWORD)).status).toBe(200);
      expect((await login(email.toLowerCase(), PASSWORD)).status).toBe(200);
    });

    it('does not accept a Unicode look-alike of an address (it is not even a valid address)', async () => {
      const email = await h.verifiedAccount(uniqueEmail('Fold'));
      const fullwidth = email.replace('Fold', 'Ｆｏｌｄ');
      expect((await login(fullwidth, PASSWORD)).status).toBe(400);
    });

    it('refuses a password with the wrong case, a trailing space, or an empty one', async () => {
      const email = await h.verifiedAccount();
      expect((await login(email, PASSWORD.toUpperCase())).status).toBe(401);
      expect((await login(email, `${PASSWORD} `)).status).toBe(401);
      expect((await login(email, '')).status).toBe(400);
    });
  });

  describe('uniform errors (spec 9.1)', () => {
    it('answers an unknown email and a wrong password with the identical status, body and headers', async () => {
      const email = await h.verifiedAccount();
      const wrongPassword = await login(email, 'definitely not the password');
      const unknownEmail = await login(uniqueEmail('nobody'), 'definitely not the password');
      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(observable(unknownEmail)).toBe(observable(wrongPassword));
    });

    it('answers a Google-only account (no password) like a wrong password', async () => {
      const email = uniqueEmail('google');
      await h.db
        .insertInto('users')
        .values({
          id: randomUUID(),
          email,
          email_key: email,
          google_subject: `sub-${randomUUID()}`,
          email_verified_at: '2026-10-01T00:00:00Z',
        })
        .execute();
      const wrongPassword = await login(await h.verifiedAccount(), 'x'.repeat(12));
      const googleOnly = await login(email, 'x'.repeat(12));
      expect(observable(googleOnly)).toBe(observable(wrongPassword));
    });

    it('verifies a password against a hash with the current parameters for an unknown email, exactly as for a wrong password', async () => {
      // The structural guarantee behind the timing test below: one real Argon2id verification
      // per attempt, whether or not the account exists. Skipping it (the usual bug) fails here on
      // any machine, whatever the load.
      const email = await h.verifiedAccount();
      verifySpy.mockClear();
      await login(email, 'wrong password 1');
      await login(uniqueEmail('nobody'), 'wrong password 1');
      expect(verifySpy).toHaveBeenCalledTimes(2);
      const [known, unknown] = verifySpy.mock.calls;
      const parameters = (hash: string | undefined): string | undefined =>
        /^\$argon2id\$v=19\$(m=\d+,t=\d+,p=\d+)\$/.exec(hash ?? '')?.[1];
      expect(known?.[0]).toBe('wrong password 1');
      expect(unknown?.[0]).toBe('wrong password 1');
      expect(parameters(unknown?.[1])).toBe('m=19456,t=2,p=1');
      expect(parameters(unknown?.[1])).toBe(parameters(known?.[1]));
      expect(unknown?.[1]).not.toBe(known?.[1]);
    });

    it('also corroborates it by time: unknown and wrong-password lower quartiles agree within 0.5x to 2x', async () => {
      // One Argon2id hash (about 50 ms) plus one indexed query (about 1 ms) either way. Skipping
      // the hash for unknown emails gives a ratio near 0.02, far outside the band. The band is
      // wide on purpose: a loaded machine (the whole suite runs in parallel) stretches both paths
      // by an unpredictable factor. Samples alternate so load hits both equally, and the lower
      // quartile ignores the slow outliers.
      // Three accounts, so that none collects the 10 failures that switch on the account limit
      // (a rate-limited answer skips the hash and would make the "known" path look fast).
      const accounts = [
        await h.verifiedAccount(),
        await h.verifiedAccount(),
        await h.verifiedAccount(),
      ];
      const known: number[] = [];
      const unknown: number[] = [];
      for (let round = 0; round < 21; round += 1) {
        const email = accounts[round % accounts.length] ?? '';
        let started = performance.now();
        await login(uniqueEmail('nobody'), 'wrong password', { ip: `203.0.114.${round + 1}` });
        unknown.push(performance.now() - started);
        started = performance.now();
        const answer = await login(email, 'wrong password', { ip: `203.0.113.${round + 1}` });
        known.push(performance.now() - started);
        expect(answer.status).toBe(401);
      }
      const ratio = lowerQuartile(unknown) / lowerQuartile(known);
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    });

    it('answers an unverified account with FORBIDDEN only for the right password', async () => {
      const email = uniqueEmail('pending');
      await h.post('/v1/auth/register', { email, password: PASSWORD });
      await h.settle();
      const deviceId = randomUUID();
      const right = await login(email, PASSWORD, { deviceId });
      expect(right.status).toBe(403);
      expect(right.body).toMatchObject({ code: 'FORBIDDEN' });
      // A wrong password on the same account is the plain uniform refusal.
      const wrong = await login(email, 'not the password');
      const unknown = await login(uniqueEmail('nobody'), 'not the password');
      expect(observable(wrong)).toBe(observable(unknown));
      // And nothing was created for the refused sign-in.
      const devices = await h.db
        .selectFrom('devices')
        .select('id')
        .where('id', '=', deviceId)
        .execute();
      expect(devices).toHaveLength(0);
      await h.post('/v1/auth/verify-email', { token: h.mail.tokenOf() });
      expect((await login(email, PASSWORD)).status).toBe(200);
    });

    it('validates the shape of the request and echoes no value of it', async () => {
      const response = await h.post('/v1/auth/login', {
        email: 'a@b.org',
        password: 'a'.repeat(200),
        device: { id: 'not-a-uuid', name: '', platform: 'beos', appVersion: '' },
      });
      expect(response.status).toBe(400);
      expect(response.text).not.toContain('a'.repeat(50));
      expect(
        (await h.post('/v1/auth/login', { email: 'a@b.org', password: PASSWORD })).status,
      ).toBe(400);
      expect(
        (
          await h.post('/v1/auth/login', {
            email: 'a@b.org',
            password: PASSWORD,
            device: deviceInfo(),
            admin: true,
          })
        ).status,
      ).toBe(400);
    });
  });

  describe('rate limits (spec 9.1)', () => {
    it('stops guessing an account after 10 wrong passwords, even for the right one, and says when to retry', async () => {
      const email = await h.verifiedAccount();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await login(email, `wrong ${attempt} password`)).status).toBe(401);
      }
      const blocked = await login(email, PASSWORD);
      expect(blocked.status).toBe(429);
      expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(Number(blocked.headers.get('retry-after'))).toBe(15 * 60);
      h.clock.advance({ minutes: 15 });
      expect((await login(email, PASSWORD)).status).toBe(200);
    });

    it('limits an unknown address exactly like a known one, so 429 reveals nothing', async () => {
      const unknown = uniqueEmail('ghost');
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        statuses.push((await login(unknown, 'whatever you like')).status);
      }
      expect(statuses).toEqual([...Array<number>(10).fill(401), 429, 429]);
    });

    it('counts every spelling of an address against one account', async () => {
      const email = await h.verifiedAccount(uniqueEmail('Spelling'));
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login(email.toUpperCase(), `bad ${attempt} password`);
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login(email, `bad ${attempt} password`);
      }
      expect((await login(email, PASSWORD)).status).toBe(429);
    });

    it('lets a right password clear the failures, so occasional typos never add up', async () => {
      const email = await h.verifiedAccount();
      for (let round = 0; round < 3; round += 1) {
        for (let attempt = 0; attempt < 9; attempt += 1) {
          await login(email, `typo ${attempt} password`);
        }
        expect((await login(email, PASSWORD)).status).toBe(200);
      }
    });

    it('limits sign-in attempts per client to 30 in 15 minutes', async () => {
      const ip = '203.0.113.50';
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 32; attempt += 1) {
        statuses.push((await login(uniqueEmail('spray'), 'a password', { ip })).status);
      }
      expect(statuses.slice(0, 30)).toEqual(Array<number>(30).fill(401));
      expect(statuses.slice(30)).toEqual([429, 429]);
      expect((await login(uniqueEmail('spray'), 'a password', { ip: '203.0.113.51' })).status).toBe(
        401,
      );
    });

    it('cannot be moved by X-Forwarded-For when no proxy is trusted (TRUST_PROXY=0)', async () => {
      const direct = await startAuthHarness({ trustProxy: 0 });
      try {
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 32; attempt += 1) {
          const response = await direct.post(
            '/v1/auth/login',
            { email: uniqueEmail('spoof'), password: 'a password', device: deviceInfo() },
            {
              ip: null,
              headers: {
                'X-Forwarded-For': `198.18.0.${attempt}`,
                Forwarded: `for=198.18.1.${attempt}`,
                'X-Real-IP': `198.18.2.${attempt}`,
              },
            },
          );
          statuses.push(response.status);
        }
        expect(statuses.slice(30)).toEqual([429, 429]);
      } finally {
        await direct.close();
      }
    });

    it('cannot be moved by forging the left of X-Forwarded-For behind one trusted proxy (TRUST_PROXY=1)', async () => {
      // The proxy appends the real peer on the right; whatever the client wrote on the left is
      // ignored. Thirty-two requests from one real peer with 32 forged "client" addresses.
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const response = await login(uniqueEmail('forge'), 'a password', {
          ip: null,
          headers: { 'X-Forwarded-For': `10.9.${attempt}.1, 203.0.113.77` },
        });
        statuses.push(response.status);
      }
      expect(statuses.slice(30)).toEqual([429, 429]);
      // A different real peer has its own count.
      const other = await login(uniqueEmail('forge'), 'a password', {
        ip: null,
        headers: { 'X-Forwarded-For': '10.9.0.1, 203.0.113.78' },
      });
      expect(other.status).toBe(401);
    });

    it('counts a whole IPv6 /64 as one client', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const response = await login(uniqueEmail('v6'), 'a password', {
          ip: `2001:db8:5:6:${attempt.toString(16)}::${attempt.toString(16)}`,
        });
        statuses.push(response.status);
      }
      expect(statuses.slice(30)).toEqual([429, 429]);
    });
  });

  describe('devices (devices.id is globally unique)', () => {
    it('keeps one device row when the same install signs in again, and retires its old credentials', async () => {
      const email = await h.verifiedAccount();
      const deviceId = randomUUID();
      const first = await h.signIn(email, { deviceId });
      const second = await h.signIn(email, { deviceId });
      const devices = await h.db
        .selectFrom('devices')
        .select('id')
        .where('id', '=', deviceId)
        .execute();
      expect(devices).toHaveLength(1);
      const active = await h.db
        .selectFrom('credentials')
        .select('id')
        .where('device_id', '=', deviceId)
        .where('revoked_at', 'is', null)
        .execute();
      expect(active).toHaveLength(1);
      expect((await h.get('/v1/me', { token: first.accessToken })).status).toBe(401);
      expect((await h.get('/v1/me', { token: second.accessToken })).status).toBe(200);
      expect((await h.post('/v1/auth/refresh', { refreshToken: first.refreshToken })).status).toBe(
        401,
      );
    });

    it('updates the name and version a device reports', async () => {
      const email = await h.verifiedAccount();
      const deviceId = randomUUID();
      await h.signIn(email, { deviceId });
      await h.post('/v1/auth/login', {
        email,
        password: PASSWORD,
        device: { id: deviceId, name: 'Renamed laptop', platform: 'android', appVersion: '2.3.4' },
      });
      const device = await h.db
        .selectFrom('devices')
        .selectAll()
        .where('id', '=', deviceId)
        .executeTakeFirstOrThrow();
      expect(device).toMatchObject({
        name: 'Renamed laptop',
        platform: 'android',
        app_version: '2.3.4',
      });
    });

    it('D-34: moves an install to the next account that signs in on it: the old row and credentials are deleted, never reassigned', async () => {
      const first = await h.verifiedAccount();
      const second = await h.verifiedAccount();
      const deviceId = randomUUID();
      const before = await h.signIn(first, { deviceId });
      const after = await h.signIn(second, { deviceId });

      const device = await h.db
        .selectFrom('devices')
        .selectAll()
        .where('id', '=', deviceId)
        .executeTakeFirstOrThrow();
      expect(device.user_id).toBe(after.userId);
      const credentials = await h.db
        .selectFrom('credentials')
        .selectAll()
        .where('device_id', '=', deviceId)
        .execute();
      expect(credentials.every((row) => row.user_id === after.userId)).toBe(true);
      expect(credentials.filter((row) => row.revoked_at === null)).toHaveLength(1);
      // The first account is signed out of that install for good.
      expect((await h.get('/v1/me', { token: before.accessToken })).status).toBe(401);
      expect((await h.post('/v1/auth/refresh', { refreshToken: before.refreshToken })).status).toBe(
        401,
      );
      expect((await h.get('/v1/me', { token: after.accessToken })).body).toMatchObject({
        id: after.userId,
      });
    });

    it('stays consistent when two accounts sign in on one install at the same moment', async () => {
      const first = await h.verifiedAccount();
      const second = await h.verifiedAccount();
      const deviceId = randomUUID();
      const answers = await Promise.all([
        login(first, PASSWORD, { deviceId }),
        login(second, PASSWORD, { deviceId }),
        login(first, PASSWORD, { deviceId }),
        login(second, PASSWORD, { deviceId }),
      ]);
      expect(answers.every((answer) => answer.status === 200)).toBe(true);
      const devices = await h.db
        .selectFrom('devices')
        .selectAll()
        .where('id', '=', deviceId)
        .execute();
      expect(devices).toHaveLength(1);
      const credentials = await h.db
        .selectFrom('credentials')
        .selectAll()
        .where('device_id', '=', deviceId)
        .where('revoked_at', 'is', null)
        .execute();
      expect(credentials).toHaveLength(1);
      expect(credentials[0]?.user_id).toBe(devices[0]?.user_id);
      // Whoever won, only the winner's token still opens anything.
      const tokens = answers.map((answer) => (answer.body as { accessToken: string }).accessToken);
      const statuses = await Promise.all(tokens.map((token) => h.get('/v1/me', { token })));
      expect(statuses.filter((response) => response.status === 200)).toHaveLength(1);
    });
  });
});
