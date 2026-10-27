// QA T1.5 (docs/qa/T1.5.md): adversarial checks on the auth core that the build's specs do not
// make. Round 1 found bugs 1-3 here; bugs 1 and 2 are fixed and their tests state the required
// behaviour, bug 3 is an accepted residual (D-34) and its test pins the accepted behaviour.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeClock } from '../../platform/clock/fake-clock.js';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import {
  PASSWORD,
  START_INSTANT,
  deviceInfo,
  startAuthHarness,
  uniqueEmail,
  type ApiResponse,
  type AuthHarness,
} from './auth.testing.js';

describe.skipIf(databaseTestsSkipped)('QA T1.5: auth core under attack', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const login = (email: string, password: string, ip?: string): Promise<ApiResponse> =>
    h.post(
      '/v1/auth/login',
      { email, password, device: deviceInfo() },
      ip === undefined ? {} : { ip },
    );

  describe('per-account sign-in limit (spec 9.1, 10 wrong passwords per 15 minutes)', () => {
    // Bug 1 (fixed): the limit was checked before the hash and counted after it, so every attempt
    // that arrived while the first hashed passed the check. Now counted before any work.
    it('allows no more than 10 wrong-password verdicts for one account when 40 guesses arrive at once from 40 clients', async () => {
      const email = await h.verifiedAccount();
      const responses = await Promise.all(
        Array.from({ length: 40 }, (_, attempt) => login(email, `guess number ${attempt}`)),
      );
      const statuses = responses.map((response) => response.status);
      const verdicts = statuses.filter((status) => status === 401).length;
      // The required bound: a guess is a verdict (401) only while the account is under its limit.
      expect(verdicts).toBeLessThanOrEqual(10);
    });

    // Bug 2 (fixed): the limiter's bound evicted the oldest window, whoever it belonged to. Ten
    // thousand fresh keys (cheap resend requests from distinct IPv6 /64s) pushed out the account's
    // failure counter. Now each rule has its own table and a refusing window is never evicted.
    it('keeps an account blocked after its 10 wrong passwords when other clients flood the limiter with new keys', async () => {
      const email = await h.verifiedAccount();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await login(email, `wrong guess ${attempt}`)).status).toBe(401);
      }
      expect((await login(email, 'wrong guess again')).status).toBe(429);

      // 5 000 resends, each from its own /64 and for its own address: 2 new windows each.
      // Batches small enough that a loaded Windows machine does not refuse connections (a batch
      // of 250 did, ECONNREFUSED at the listen backlog, once in seven full runs).
      const batch = 25;
      for (let start = 0; start < 5_000; start += batch) {
        await Promise.all(
          Array.from({ length: batch }, (_, offset) => {
            const n = start + offset;
            return h.post(
              '/v1/auth/resend-verification',
              { email: `flood.${n}@example.org` },
              { ip: `2001:db8:${(n >> 16).toString(16)}:${(n & 0xffff).toString(16)}::1` },
            );
          }),
        );
      }
      await h.settle();

      // Still inside the 15-minute window: the account must still be blocked.
      expect((await login(email, 'wrong guess after the flood')).status).toBe(429);
    }, 120_000);
  });

  describe('re-registering an unverified address (US-4.1, spec 9.1)', () => {
    // Bug 3, accepted residual (D-34): the latest sign-up of a pending address wins, also a stranger's.
    it('lets a later sign-up of a pending address win: the newest link verifies the account with the latest password', async () => {
      const email = uniqueEmail('owner');
      expect(
        (await h.post('/v1/auth/register', { email, password: 'the owners own password' })).status,
      ).toBe(204);
      await h.settle();
      const ownersLink = h.mail.tokenOf();

      h.clock.advance({ seconds: 61 });
      expect(
        (await h.post('/v1/auth/register', { email, password: 'a strangers password' })).status,
      ).toBe(204);
      await h.settle();
      const newestLink = h.mail.tokenOf();
      expect(newestLink).not.toBe(ownersLink);
      // The two mails are identical apart from the token: the owner cannot tell which is theirs.
      const mails = h.mail.sent.filter((mail) => mail.to === email);
      expect(mails).toHaveLength(2);
      expect(mails[0]?.subject).toBe(mails[1]?.subject);

      // The owner's own link is dead; the owner uses the one that works.
      expect((await h.post('/v1/auth/verify-email', { token: ownersLink })).status).toBe(400);
      expect((await h.post('/v1/auth/verify-email', { token: newestLink })).status).toBe(204);

      const stranger = await login(email, 'a strangers password');
      const owner = await login(email, 'the owners own password');
      // Accepted: the latest password is the account's; the owner recovers with a reset (AUTH-07).
      expect(stranger.status).toBe(200);
      expect(owner.status).toBe(401);
    });
  });

  describe('secrets in logs (spec 9.1, OPS-04)', () => {
    it('writes no password, email address or token to the logs across register, verify, resend, login, refresh and logout', async () => {
      const email = uniqueEmail('Logged.Person');
      const password = 'a very recognisable password 7';
      await h.post('/v1/auth/register', { email, password });
      await h.settle();
      const link = h.mail.tokenOf();
      await login(email, password); // 403, unverified
      await login(email, 'another recognisable wrong one'); // 401
      await h.post('/v1/auth/resend-verification', { email });
      await h.post('/v1/auth/verify-email', { token: link });
      await h.post('/v1/auth/verify-email', { token: link }); // used
      const signedIn = await h.signIn(email, { password });
      const rotated = await h.post('/v1/auth/refresh', { refreshToken: signedIn.refreshToken });
      await h.post('/v1/auth/refresh', { refreshToken: signedIn.refreshToken }); // reuse
      await h.post('/v1/auth/logout', undefined, { token: signedIn.accessToken });
      await h.settle();

      const logs = h.logs.join('\n');
      const rotatedBody = rotated.body as { refreshToken: string; accessToken: string };
      for (const secret of [
        password,
        'another recognisable wrong one',
        email,
        email.toLowerCase(),
        link,
        signedIn.refreshToken,
        signedIn.accessToken,
        rotatedBody.refreshToken,
        rotatedBody.accessToken,
      ]) {
        expect(logs.includes(secret), `log holds ${secret.slice(0, 12)}...`).toBe(false);
      }
    });
  });

  describe('first sign-in (AUTH-12, US-4.1, US-6.1)', () => {
    it('US-6.1: a second device that finishes setup with another command and timezone gets the same seven tags and the first timezone', async () => {
      const email = await h.verifiedAccount();
      const laptop = await h.signIn(email);
      const phone = await h.signIn(email);
      const first = await h.post(
        '/v1/me/first-sign-in',
        { commandId: randomUUID(), timezone: 'Asia/Dhaka' },
        { token: laptop.accessToken },
      );
      const second = await h.post(
        '/v1/me/first-sign-in',
        { commandId: randomUUID(), timezone: 'Europe/Berlin' },
        { token: phone.accessToken },
      );
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const a = first.body as { preferences: { timezone: string }; tags: { id: string }[] };
      const b = second.body as { preferences: { timezone: string }; tags: { id: string }[] };
      expect(b.preferences.timezone).toBe('Asia/Dhaka');
      // The same seven tags. Their order differs (Low note 1 in the QA report): the replayed
      // state lists them by id, not in the TAG-07 order the first answer used.
      const ids = (tags: { id: string }[]): string[] => tags.map((tag) => tag.id).sort();
      expect(ids(b.tags)).toEqual(ids(a.tags));
      expect(a.tags).toHaveLength(7);
    });

    it.each([
      'Etc/GMT+5',
      'UTC',
      'utc',
      'America/Argentina/Buenos_Aires',
      'America/Port-au-Prince',
    ])('accepts the IANA name %s', async (timezone) => {
      const email = await h.verifiedAccount();
      const device = await h.signIn(email);
      const response = await h.post(
        '/v1/me/first-sign-in',
        { commandId: randomUUID(), timezone },
        { token: device.accessToken },
      );
      expect(response.status).toBe(200);
    });

    it.each(['Local', 'Z', 'UTC+6', '../etc/passwd', 'Asia/Dhaka\u0000', 'Asia//Dhaka', '0'])(
      'refuses %j as a timezone with VALIDATION',
      async (timezone) => {
        const email = await h.verifiedAccount();
        const device = await h.signIn(email);
        const response = await h.post(
          '/v1/me/first-sign-in',
          { commandId: randomUUID(), timezone },
          { token: device.accessToken },
        );
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION' });
      },
    );
  });

  describe('refresh (D-13)', () => {
    it('signs a device out when it retries a refresh whose answer it lost (no grace window): recorded behaviour', async () => {
      const email = await h.verifiedAccount();
      const device = await h.signIn(email, { password: PASSWORD });
      const first = await h.post('/v1/auth/refresh', { refreshToken: device.refreshToken });
      expect(first.status).toBe(200);
      // The answer never reached the device, which retries with the token it still holds.
      const retry = await h.post('/v1/auth/refresh', { refreshToken: device.refreshToken });
      expect(retry.status).toBe(401);
      const successor = (first.body as { refreshToken: string }).refreshToken;
      expect((await h.post('/v1/auth/refresh', { refreshToken: successor })).status).toBe(401);
    });
  });
});

// QA round 2: the bug 2 fix under a flood of the same rule, with a small bound so the table fills.
describe.skipIf(databaseTestsSkipped)('QA T1.5 round 2: login limiter with a full table', () => {
  const BOUND = 20;
  let h: AuthHarness;

  beforeAll(async () => {
    // Its own clock: nothing here advances time.
    h = await startAuthHarness({
      overrides: [
        { token: RateLimiter, value: new RateLimiter(new FakeClock(START_INSTANT), BOUND) },
      ],
    });
  });
  afterAll(async () => {
    await h.close();
  });

  const login = (email: string, password: string): Promise<ApiResponse> =>
    h.post('/v1/auth/login', { email, password, device: deviceInfo() });

  it('keeps a blocked account blocked when new addresses flood the same rule, and refuses newcomers once every window refuses (fails closed)', async () => {
    const email = await h.verifiedAccount();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await login(email, `wrong guess ${attempt}`)).status).toBe(401);
    }
    expect((await login(email, 'wrong guess again')).status).toBe(429);

    // 3 x BOUND guesses on fresh addresses, each from a fresh client.
    for (let n = 0; n < 3 * BOUND; n += 1) {
      expect([401, 429]).toContain((await login(uniqueEmail('flood'), 'a flood password')).status);
    }
    expect((await login(email, 'wrong guess after the flood')).status).toBe(429);
    expect((await login(email, PASSWORD)).status).toBe(429);

    // Fill every window to its limit: then a newcomer, even with the right password, is refused.
    const held = Array.from({ length: BOUND }, () => uniqueEmail('held'));
    for (const address of held) {
      for (let attempt = 0; attempt < 10; attempt += 1) await login(address, 'a held password');
    }
    const newcomer = await h.verifiedAccount();
    const refused = await login(newcomer, PASSWORD);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
  }, 120_000);
});
