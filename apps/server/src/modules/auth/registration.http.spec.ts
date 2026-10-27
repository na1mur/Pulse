// US-4.1, AUTH-01, AUTH-10 over real HTTP and a real PostgreSQL: sign-up answers every address the
// same way, creates the account atomically, and mails the link after the commit.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from '../../domain/auth/password-hash.js';
import { emailKey } from '../../domain/email-key.js';
import { DEFAULT_RUNTIME_LIMITS } from '../../platform/config/app-config.js';
import { RevisionService } from '../../platform/revisions/revision.service.js';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import {
  PASSWORD,
  containsToken,
  dumpDatabaseText,
  startAuthHarness,
  uniqueEmail,
  type ApiResponse,
  type AuthHarness,
} from './auth.testing.js';

/** What a caller can see of an answer, minus what is per request (IDs, times). */
function observable(response: ApiResponse): unknown {
  const body = response.body as { requestId?: string } | undefined;
  return {
    status: response.status,
    text: response.text.replace(body?.requestId ?? '\u0000', '<request id>'),
    headers: [...response.headers.keys()].filter((name) => !name.startsWith('pulse-')).sort(),
  };
}

describe.skipIf(databaseTestsSkipped)('auth.register (US-4.1, AUTH-01)', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const register = (email: string, password = PASSWORD, ip?: string): Promise<ApiResponse> =>
    h.post('/v1/auth/register', { email, password }, ip === undefined ? {} : { ip });
  const userRow = (email: string) =>
    h.db
      .selectFrom('users')
      .selectAll()
      .where('email_key', '=', emailKey(email))
      .executeTakeFirst();

  it('creates the account with its revision counter and default preferences, and mails the link', async () => {
    const email = uniqueEmail('Ann');
    const response = await register(email);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    await h.settle();

    const user = await userRow(email);
    expect(user).toMatchObject({ email, email_key: email.toLowerCase(), email_verified_at: null });
    expect(user?.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user?.google_subject).toBeNull();

    const revision = await h.db
      .selectFrom('user_revisions')
      .selectAll()
      .where('user_id', '=', user?.id ?? '')
      .executeTakeFirst();
    expect(revision?.revision).toBe(0);
    const preferences = await h.db
      .selectFrom('user_preferences')
      .selectAll()
      .where('user_id', '=', user?.id ?? '')
      .executeTakeFirst();
    expect(preferences).toMatchObject({
      timezone: null,
      onboarding_completed_at: null,
      week_start: 'monday',
      notify_credit_low: true,
      notify_credit_zero: true,
      notify_credit_below_zero: true,
      notify_daily_goal: true,
      notify_weekly_monthly_goal: true,
      notify_game_suggestion: true,
    });

    const mail = h.mail.sent.at(-1);
    expect(mail?.to).toBe(email);
    expect(mail?.text).toContain('/auth/verify-email?token=');
  });

  it('stores a hash of the token, never the token or the password', async () => {
    const email = uniqueEmail();
    const password = 'a very unusual password 8f3a1c';
    await register(email, password);
    await h.settle();
    const token = h.mail.tokenOf();
    const stored = await dumpDatabaseText(h.db);
    expect(containsToken(stored, token)).toBe(false);
    expect(stored).not.toContain(password);
    const tokens = await h.db.selectFrom('email_tokens').selectAll().execute();
    for (const row of tokens) expect(row.token_hash).toHaveLength(32);
    // Nor do the logs hold the token, the password or the address.
    expect(h.logs.length).toBeGreaterThan(0); // what is absent below was written to
    const logs = h.logs.join('\n');
    expect(containsToken(logs, token)).toBe(false);
    expect(logs).not.toContain(password);
    expect(logs).not.toContain(email);
  });

  it('gives a new address, a verified address and an unverified one the identical answer', async () => {
    const verified = await h.verifiedAccount();
    const pending = uniqueEmail();
    await register(pending);
    const mailsBefore = h.mail.sent.length;

    const answers = [
      await register(uniqueEmail()),
      await register(verified),
      await register(pending),
    ];
    await h.settle();
    expect(answers.map((answer) => answer.status)).toEqual([204, 204, 204]);
    expect(new Set(answers.map((answer) => JSON.stringify(observable(answer)))).size).toBe(1);
    // Only the new address was mailed: the verified one gets nothing, and the pending one was
    // mailed a moment ago (one a minute).
    expect(h.mail.sent.length - mailsBefore).toBe(1);
  });

  it('leaves the resend limit the same after a sign-up of a new, a verified or a pending address', async () => {
    // Verify round 1: a sign-up armed the once-a-minute resend limit for a new and a pending
    // address but not for a verified one, so "register, then resend" answered 429 or 204 and told
    // whether the address was a verified account (spec 9.1).
    const verified = await h.verifiedAccount();
    const pending = uniqueEmail('pending');
    await register(pending);
    await h.settle();
    // Every earlier window is over: the three addresses start from the same limiter state.
    h.clock.advance({ seconds: 61 });
    const addresses = [uniqueEmail('new'), verified, pending];
    const shape = (response: ApiResponse): string =>
      `${response.status} ${response.headers.get('retry-after') ?? '-'} ${JSON.stringify(observable(response))}`;

    const signUps = [];
    for (const address of addresses) signUps.push(await register(address));
    expect(signUps.map((response) => response.status)).toEqual([204, 204, 204]);
    const again = [];
    for (const address of addresses) again.push(await register(address));
    expect(new Set(again.map(shape)).size).toBe(1);
    expect(again[0]?.status).toBe(204);

    const resends = [];
    for (const address of addresses) {
      resends.push(await h.post('/v1/auth/resend-verification', { email: address }));
    }
    expect(resends.map((response) => response.status)).toEqual([429, 429, 429]);
    expect(new Set(resends.map(shape)).size).toBe(1);

    // And after the minute, every one of them may ask again.
    h.clock.advance({ seconds: 61 });
    const later = [];
    for (const address of addresses) {
      later.push(await h.post('/v1/auth/resend-verification', { email: address }));
    }
    expect(later.map((response) => response.status)).toEqual([204, 204, 204]);
    await h.settle();
  });

  it('leaves the resend limit the same when a resend came first, whatever the address', async () => {
    const verified = await h.verifiedAccount();
    const pending = uniqueEmail('pending');
    await register(pending);
    await h.settle();
    h.clock.advance({ seconds: 61 });
    const addresses = [uniqueEmail('new'), verified, pending];
    for (const address of addresses) {
      expect((await h.post('/v1/auth/resend-verification', { email: address })).status).toBe(204);
    }
    // A sign-up inside the resend minute still answers 204, still creates a new account, and
    // leaves the minute as it was for all three.
    for (const address of addresses) expect((await register(address)).status).toBe(204);
    expect(await userRow(addresses[0] ?? '')).toBeDefined();
    const resends = [];
    for (const address of addresses) {
      resends.push(await h.post('/v1/auth/resend-verification', { email: address }));
    }
    expect(resends.map((response) => response.status)).toEqual([429, 429, 429]);
    expect(new Set(resends.map((response) => response.headers.get('retry-after'))).size).toBe(1);
    // The new account still got its link: the minute limits repeat mail, not the first one.
    await h.settle();
    expect(h.mail.sent.some((mail) => mail.to === addresses[0])).toBe(true);
  });

  it('holds every successful sign-up to the response floor, new, verified or pending address alike', async () => {
    // The guarantee is a minimum, not a ratio: a new address does about 8 ms more work than an
    // existing one, so equal answers need every path held to one duration above the slowest
    // path's work (60 ms measured, floor 150 ms here). A minimum cannot flake under load (load
    // only makes a path slower, and then it is above the floor anyway), and without the floor the
    // paths would answer in 50-60 ms and fail this on any machine. Lower quartile: the slow
    // outliers of a loaded machine never decide.
    const floorMs = 150;
    const floored = await startAuthHarness({
      config: { limits: { ...DEFAULT_RUNTIME_LIMITS, authResponseFloorMs: floorMs } },
    });
    try {
      const verified = await floored.verifiedAccount();
      const pending = uniqueEmail('pending');
      await floored.post('/v1/auth/register', { email: pending, password: PASSWORD });
      const times = { fresh: [] as number[], verified: [] as number[], pending: [] as number[] };
      const time = async (bucket: number[], email: string): Promise<void> => {
        const started = performance.now();
        const response = await floored.post('/v1/auth/register', { email, password: PASSWORD });
        expect(response.status).toBe(204);
        bucket.push(performance.now() - started);
      };
      for (let round = 0; round < 9; round += 1) {
        await time(times.fresh, uniqueEmail('fresh'));
        await time(times.verified, verified);
        await time(times.pending, pending);
      }
      const lowerQuartile = (values: number[]): number =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length / 4)] ?? 0;
      // One millisecond of slack: a timer may fire up to a millisecond early.
      for (const bucket of Object.values(times)) {
        expect(lowerQuartile(bucket)).toBeGreaterThanOrEqual(floorMs - 1);
      }
    } finally {
      await floored.close();
    }
  });

  it('answers without waiting for the mail, so the answer cannot depend on whether one is sent', async () => {
    const email = uniqueEmail('gate');
    const release = h.mail.holdSending();
    try {
      // The transport is blocked: only an answer that does not wait for it can arrive.
      expect((await register(email)).status).toBe(204);
      expect(h.mail.sent.some((mail) => mail.to === email)).toBe(false);
    } finally {
      release();
    }
    await h.settle();
    expect(h.mail.sent.at(-1)?.to).toBe(email);
  });

  it('treats case and Unicode spellings of an address as the same account', async () => {
    const email = uniqueEmail('Case');
    await register(email);
    await register(email.toUpperCase());
    await register(` ${email}`.trim());
    const users = await h.db
      .selectFrom('users')
      .select('id')
      .where('email_key', '=', emailKey(email))
      .execute();
    expect(users).toHaveLength(1);
  });

  it('refuses an address the mail rule would refuse, the same way for everyone', async () => {
    for (const email of [
      'not-an-email',
      'ünï@example.org',
      'a@b',
      'a b@example.org',
      '"quoted"@example.org',
      'a@ｅxample.org',
    ]) {
      const response = await register(email);
      expect(response.status).toBe(400);
      expect((response.body as { code: string }).code).toBe('VALIDATION');
    }
    // Valid per the contract's email check, refused by the mail address rule.
    const response = await register('a@[192.168.0.1]');
    expect(response.status).toBe(400);
  });

  it('enforces the password length of 8 to 128 characters without echoing the password', async () => {
    expect((await register(uniqueEmail(), 'a'.repeat(7))).status).toBe(400);
    expect((await register(uniqueEmail(), 'a'.repeat(129))).status).toBe(400);
    expect((await register(uniqueEmail(), 'a'.repeat(8))).status).toBe(204);
    expect((await register(uniqueEmail(), 'a'.repeat(128))).status).toBe(204);
    const tooShort = await register(uniqueEmail(), 'hunter2');
    expect(tooShort.text).not.toContain('hunter2');
  });

  it('rejects unknown fields and a body that is not JSON', async () => {
    const extra = await h.post('/v1/auth/register', {
      email: uniqueEmail(),
      password: PASSWORD,
      isAdmin: true,
    });
    expect(extra.status).toBe(400);
    const garbage = await h.post('/v1/auth/register', '{"email":', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(garbage.status).toBe(400);
  });

  it('keeps one account when the same address registers many times at once', async () => {
    const email = uniqueEmail('race');
    const answers = await Promise.all(Array.from({ length: 8 }, () => register(email)));
    expect(answers.map((answer) => answer.status)).toEqual(Array<number>(8).fill(204));
    const users = await h.db
      .selectFrom('users')
      .select('id')
      .where('email_key', '=', emailKey(email))
      .execute();
    expect(users).toHaveLength(1);
    await h.settle();
  });

  it('D-34: lets the latest sign-up of an unverified address win, so a squatter cannot keep the account', async () => {
    const email = uniqueEmail('squat');
    await register(email, 'the squatters password');
    await h.settle();
    const squatterToken = h.mail.tokenOf();
    h.clock.advance({ minutes: 2 });
    await register(email, 'the real owners password');
    await h.settle();
    const ownerToken = h.mail.tokenOf();
    expect(ownerToken).not.toBe(squatterToken);

    // The first link no longer works; the second does.
    expect((await h.post('/v1/auth/verify-email', { token: squatterToken })).status).toBe(400);
    expect((await h.post('/v1/auth/verify-email', { token: ownerToken })).status).toBe(204);
    // The account holds the second password: the first can never sign in (T1.5 slice 3 tests it).
    const user = await userRow(email);
    expect(await verifyPassword('the real owners password', user?.password_hash ?? '')).toBe(true);
    expect(await verifyPassword('the squatters password', user?.password_hash ?? '')).toBe(false);
  });

  it('answers 204 and mails nothing more within a minute of the last mail to an unverified address', async () => {
    const email = uniqueEmail('twice');
    await register(email);
    await h.settle();
    const count = h.mail.sent.length;
    const second = await register(email);
    await h.settle();
    expect(second.status).toBe(204);
    expect(h.mail.sent.length).toBe(count);
    h.clock.advance({ seconds: 61 });
    await register(email);
    await h.settle();
    expect(h.mail.sent.length).toBe(count + 1);
  });

  it('still creates the account when the mail cannot be sent, logs it, and lets the user resend', async () => {
    const email = uniqueEmail('mailfail');
    h.mail.failWith = Object.assign(new Error(`connect ECONNREFUSED for ${email}`), {
      code: 'ECONNREFUSED',
    });
    const response = await register(email);
    await h.settle();
    h.mail.failWith = undefined;
    expect(response.status).toBe(204);
    expect(await userRow(email)).toBeDefined();
    expect(h.logs.length).toBeGreaterThan(0); // what is absent below was written to
    const logs = h.logs.join('\n');
    expect(logs).toContain('not sent');
    expect(logs).not.toContain(email);

    h.clock.advance({ seconds: 61 });
    const count = h.mail.sent.length;
    expect((await h.post('/v1/auth/resend-verification', { email })).status).toBe(204);
    await h.settle();
    expect(h.mail.sent.length).toBe(count + 1);
    expect(h.mail.sent.at(-1)?.to).toBe(email);
  });

  it('creates nothing when part of the account cannot be created (one transaction)', async () => {
    const email = uniqueEmail('atomic');
    const spy = vi
      .spyOn(RevisionService.prototype, 'create')
      .mockRejectedValueOnce(new Error('disk full'));
    const response = await register(email);
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(await userRow(email)).toBeUndefined();
    const prefs = await h.db.selectFrom('user_preferences').select('user_id').execute();
    const users = await h.db.selectFrom('users').select('id').execute();
    expect(prefs.length).toBe(users.length);
    // Nothing was mailed for an account that does not exist.
    await h.settle();
    expect(h.mail.sent.some((mail) => mail.to === email)).toBe(false);
  });

  it('limits sign-ups per client, and X-Forwarded-For does not move the limit when no proxy is trusted', async () => {
    const limited = await startAuthHarness({ trustProxy: 0 });
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await limited.post(
          '/v1/auth/register',
          { email: uniqueEmail(), password: PASSWORD },
          { ip: null, headers: { 'X-Forwarded-For': `203.0.113.${attempt}` } },
        );
        statuses.push(response.status);
        if (response.status === 429) {
          expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
          expect((response.body as { code: string }).code).toBe('RATE_LIMITED');
        }
      }
      expect(statuses.slice(0, 10)).toEqual(Array<number>(10).fill(204));
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      await limited.close();
    }
  });
});
