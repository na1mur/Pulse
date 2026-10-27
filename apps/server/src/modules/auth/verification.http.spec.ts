// AUTH-10, US-4.1: the verification link (24 h, single use), its page, and "resend" (once a
// minute), over real HTTP and PostgreSQL. Every refusal of a link is the same refusal.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashEmailToken } from '../../domain/auth/tokens.js';
import { newToken } from './new-token.js';
import { emailKey } from '../../domain/email-key.js';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import {
  PASSWORD,
  containsToken,
  startAuthHarness,
  uniqueEmail,
  type ApiResponse,
  type AuthHarness,
} from './auth.testing.js';

describe.skipIf(databaseTestsSkipped)('email verification (AUTH-10, US-4.1)', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const verify = (token: string, ip?: string): Promise<ApiResponse> =>
    h.post('/v1/auth/verify-email', { token }, ip === undefined ? {} : { ip });
  const resend = (email: string, ip?: string): Promise<ApiResponse> =>
    h.post('/v1/auth/resend-verification', { email }, ip === undefined ? {} : { ip });
  const user = (email: string) =>
    h.db
      .selectFrom('users')
      .selectAll()
      .where('email_key', '=', emailKey(email))
      .executeTakeFirstOrThrow();

  /** Registers an address and returns its mailed token. */
  async function pending(email = uniqueEmail()): Promise<{ email: string; token: string }> {
    expect((await h.post('/v1/auth/register', { email, password: PASSWORD })).status).toBe(204);
    await h.settle();
    return { email, token: h.mail.tokenOf() };
  }

  /** The one refusal every bad link gets. */
  function expectRefused(response: ApiResponse): void {
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION',
      message: 'The link is invalid or has expired.',
    });
    expect((response.body as { details?: unknown }).details).toBeUndefined();
  }

  describe('auth.verifyEmail', () => {
    it('verifies the address at the instant of the click and answers 204', async () => {
      const { email, token } = await pending();
      h.clock.advance({ minutes: 5 });
      const response = await verify(token);
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect((await user(email)).email_verified_at?.toISOString()).toBe('2026-10-27T10:05:00.000Z');
    });

    it('refuses the same link a second time, and keeps the first verification time', async () => {
      const { email, token } = await pending();
      expect((await verify(token)).status).toBe(204);
      const before = (await user(email)).email_verified_at;
      h.clock.advance({ minutes: 1 });
      expectRefused(await verify(token));
      expect((await user(email)).email_verified_at).toEqual(before);
    });

    it('accepts the link until the last millisecond of 24 hours and refuses it from the expiry instant', async () => {
      const early = await pending();
      const late = await pending();
      h.clock.advance({ hours: 23, minutes: 59, seconds: 59, milliseconds: 999 });
      expect((await verify(early.token)).status).toBe(204);
      h.clock.advance({ milliseconds: 1 });
      expectRefused(await verify(late.token));
      expect((await user(late.email)).email_verified_at).toBeNull();
    });

    it('refuses an expired link long after, an unknown link, and malformed ones, all the same way', async () => {
      const { token } = await pending();
      h.clock.advance({ hours: 40 * 24 });
      const refusals = [
        await verify(token),
        await verify(newToken()),
        await verify('short'),
        await verify('x'.repeat(300)),
        await verify('not url safe: <script>'),
        await verify(`${token}A`),
        await verify(token.slice(1)),
      ];
      for (const refusal of refusals) expectRefused(refusal);
      expect(
        new Set(refusals.map((refusal) => refusal.text.replace(/"requestId":"[^"]*"/, ''))).size,
      ).toBe(1);
    });

    it('never echoes the presented token in the refusal', async () => {
      const token = newToken();
      const unknown = await verify(token);
      expect(unknown.text).not.toContain(token);
      const long = `${token}${'x'.repeat(400)}`;
      expect((await verify(long)).text).not.toContain(token);
    });

    it('refuses a token that was issued for another purpose', async () => {
      const { email } = await pending();
      const owner = await user(email);
      const resetToken = newToken();
      await h.db
        .insertInto('email_tokens')
        .values({
          id: randomUUID(),
          user_id: owner.id,
          purpose: 'reset_password',
          token_hash: hashEmailToken(resetToken),
          expires_at: '2026-10-28T10:00:00Z',
        })
        .execute();
      expectRefused(await verify(resetToken));
      expect((await user(email)).email_verified_at).toBeNull();
      // And it was not used up by the attempt: the reset flow can still use it.
      const row = await h.db
        .selectFrom('email_tokens')
        .select('used_at')
        .where('purpose', '=', 'reset_password')
        .where('user_id', '=', owner.id)
        .executeTakeFirstOrThrow();
      expect(row.used_at).toBeNull();
    });

    it('lets exactly one of many concurrent requests with one token succeed', async () => {
      const { email, token } = await pending();
      const answers = await Promise.all(Array.from({ length: 10 }, () => verify(token)));
      const statuses = answers.map((answer) => answer.status).sort();
      expect(statuses).toEqual([204, ...Array<number>(9).fill(400)]);
      expect((await user(email)).email_verified_at).not.toBeNull();
    });

    it('rejects unknown fields, a missing token and a body that is not JSON with VALIDATION details', async () => {
      expect((await h.post('/v1/auth/verify-email', {})).status).toBe(400);
      expect((await h.post('/v1/auth/verify-email', { token: newToken(), extra: 1 })).status).toBe(
        400,
      );
      expect(
        (
          await h.post('/v1/auth/verify-email', 'nope', {
            headers: { 'Content-Type': 'application/json' },
          })
        ).status,
      ).toBe(400);
    });

    it('is limited per client', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 32; attempt += 1) {
        statuses.push((await verify(newToken(), '203.0.113.200')).status);
      }
      expect(statuses.slice(0, 30)).toEqual(Array<number>(30).fill(400));
      expect(statuses.slice(30)).toEqual([429, 429]);
    });
  });

  describe('auth.resendVerification (AUTH-10: once a minute)', () => {
    it('sends a fresh link to an unverified account, and the old link stops working', async () => {
      const { email, token: first } = await pending();
      h.clock.advance({ seconds: 61 });
      const response = await resend(email);
      expect(response.status).toBe(204);
      await h.settle();
      const second = h.mail.tokenOf();
      expect(second).not.toBe(first);
      expect(h.mail.sent.at(-1)?.to).toBe(email);
      expectRefused(await verify(first));
      expect((await verify(second)).status).toBe(204);
    });

    it('answers a second request within a minute with 429 and Retry-After, then works again at 60 s', async () => {
      const { email } = await pending();
      h.clock.advance({ seconds: 61 });
      expect((await resend(email)).status).toBe(204);
      h.clock.advance({ seconds: 30 });
      const refused = await resend(email);
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(refused.headers.get('retry-after')).toBe('30');
      h.clock.advance({ seconds: 29, milliseconds: 999 });
      expect((await resend(email)).status).toBe(429);
      h.clock.advance({ milliseconds: 1 });
      expect((await resend(email)).status).toBe(204);
    });

    it('counts every spelling of an address as one account', async () => {
      const { email } = await pending();
      h.clock.advance({ seconds: 61 });
      expect((await resend(email)).status).toBe(204);
      expect((await resend(email.toUpperCase())).status).toBe(429);
    });

    it('gives an unknown, a pending and a verified address the same answers, limit included', async () => {
      const verified = await h.verifiedAccount();
      const { email: pendingEmail } = await pending();
      h.clock.advance({ seconds: 61 });
      const addresses = [uniqueEmail('nobody'), pendingEmail, verified];
      const first = await Promise.all(addresses.map((address) => resend(address)));
      const second = await Promise.all(addresses.map((address) => resend(address)));
      const shape = (response: ApiResponse): string =>
        `${response.status} ${response.text.replace(/"requestId":"[^"]*"/, '')} ${response.headers.get('retry-after') ?? ''}`;
      expect(new Set(first.map(shape)).size).toBe(1);
      expect(first[0]?.status).toBe(204);
      expect(new Set(second.map(shape)).size).toBe(1);
      expect(second[0]?.status).toBe(429);
    });

    it('answers without waiting for lookup or mail, for known and unknown addresses alike', async () => {
      // Structural, not timed: with the mail transport blocked, a pending address still gets its
      // 204 at once, exactly like an unknown one. If the answer waited for the work that only a
      // real account causes, the known case would hang here, and its time would reveal the account.
      const { email } = await pending();
      h.clock.advance({ seconds: 61 });
      const count = h.mail.sent.length;
      const release = h.mail.holdSending();
      try {
        expect((await resend(email)).status).toBe(204);
        expect((await resend(uniqueEmail('ghost'))).status).toBe(204);
        expect(h.mail.sent.length).toBe(count);
      } finally {
        release();
      }
      await h.settle();
      expect(h.mail.sent.length).toBe(count + 1);
      expect(h.mail.sent.at(-1)?.to).toBe(email);
    });

    it('mails only an unverified account, once', async () => {
      const verified = await h.verifiedAccount();
      h.clock.advance({ seconds: 61 });
      const count = h.mail.sent.length;
      await resend(verified);
      await resend(uniqueEmail('ghost'));
      await h.settle();
      expect(h.mail.sent.length).toBe(count);
    });

    it('does not echo or log the address or the token', async () => {
      const { email } = await pending();
      h.clock.advance({ seconds: 61 });
      const response = await resend(email);
      await h.settle();
      expect(response.text).not.toContain(email);
      expect(h.logs.length).toBeGreaterThan(0); // what is absent below was written to
      const logs = h.logs.join('\n');
      expect(logs).not.toContain(email);
      expect(containsToken(logs, h.mail.tokenOf())).toBe(false);
    });

    it('is limited per client across different addresses', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        statuses.push((await resend(uniqueEmail('bomb'), '203.0.113.201')).status);
      }
      expect(statuses.slice(0, 10)).toEqual(Array<number>(10).fill(204));
      expect(statuses.slice(10)).toEqual([429, 429]);
    });

    it('refuses an address the mail rule refuses', async () => {
      expect((await resend('not-an-email')).status).toBe(400);
      expect((await resend('ünï@example.org')).status).toBe(400);
    });
  });

  describe('the link page (GET never consumes the token, ARCHITECTURE "Email links")', () => {
    it('shows a page with a button that posts the token, and leaves the token usable', async () => {
      const { email, token } = await pending();
      const page = await h.get(`/auth/verify-email?token=${token}`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect(page.headers.get('referrer-policy')).toBe('no-referrer');
      expect(page.headers.get('cache-control')).toContain('no-store');
      expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(page.text).toContain('method="post"');
      expect(page.text).toContain(token);
      // Opening the page (a mail scanner does) did not verify anything.
      expect((await user(email)).email_verified_at).toBeNull();
      const confirmed = await h.request('POST', '/auth/verify-email', {
        body: `token=${encodeURIComponent(token)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      expect(confirmed.status).toBe(200);
      expect(confirmed.headers.get('content-type')).toContain('text/html');
      expect(confirmed.headers.get('referrer-policy')).toBe('no-referrer');
      expect((await user(email)).email_verified_at).not.toBeNull();
    });

    it('answers a bad or missing token with a page that does not echo it', async () => {
      const missing = await h.get('/auth/verify-email');
      const hostile = await h.get('/auth/verify-email?token=%3Cscript%3Ealert(1)%3C/script%3E');
      const unknown = await h.request('POST', '/auth/verify-email', {
        body: `token=${newToken()}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      for (const page of [missing, hostile, unknown]) {
        expect(page.headers.get('content-type')).toContain('text/html');
        expect(page.text).not.toContain('<script>');
        expect(page.text).not.toContain('alert(1)');
        expect(page.headers.get('referrer-policy')).toBe('no-referrer');
      }
      expect(unknown.status).toBe(400);
      expect(unknown.text).toContain('invalid or has expired');
    });

    it('does not let a repeated or oversized form body reach the service', async () => {
      const huge = await h.request('POST', '/auth/verify-email', {
        body: `token=${'a'.repeat(2_000_000)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      expect([400, 413]).toContain(huge.status);
      const twice = await h.request('POST', '/auth/verify-email', {
        body: `token=${newToken()}&token=${newToken()}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      expect(twice.status).toBe(400);
    });
  });
});
