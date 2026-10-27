// The acceptance criteria of T1.5, one test per criterion and named after it: US-4.1, US-4.3,
// US-6.1 and the features AUTH-01, AUTH-02, AUTH-10, AUTH-12 and TAG-07. The detailed and
// adversarial cases live next to each operation (registration, verification, login, refresh,
// access, first-sign-in specs); this file reads like the stories.
import { randomUUID } from 'node:crypto';
import { AuthSession, CompleteFirstSignInResult } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import {
  PASSWORD,
  deviceInfo,
  startAuthHarness,
  uniqueEmail,
  type AuthHarness,
} from './auth.testing.js';

describe.skipIf(databaseTestsSkipped)('T1.5 acceptance', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const register = (email: string, password = PASSWORD) =>
    h.post('/v1/auth/register', { email, password });
  const login = (email: string, password = PASSWORD) =>
    h.post('/v1/auth/login', { email, password, device: deviceInfo() });

  it('US-4.1 / AUTH-01: an account needs a password of at least 8 characters and an email that is unique ignoring case', async () => {
    const email = uniqueEmail('Story');
    expect((await register(email, '1234567')).status).toBe(400);
    expect((await register(email, '12345678')).status).toBe(204);
    expect((await register(email.toUpperCase(), 'another password')).status).toBe(204);
    const accounts = await h.db
      .selectFrom('users')
      .select('email')
      .where('email_key', '=', email.toLowerCase())
      .execute();
    expect(accounts).toHaveLength(1);
  });

  it('US-4.1 / AUTH-10: a verification email with a link valid for 24 hours is sent, and an unverified user cannot sign in', async () => {
    const email = uniqueEmail();
    await register(email);
    await h.settle();
    const mail = h.mail.sent.at(-1);
    expect(mail?.to).toBe(email);
    expect(mail?.text).toMatch(/\/auth\/verify-email\?token=/);
    expect((await login(email)).status).toBe(403);

    const token = h.mail.tokenOf();
    h.clock.advance({ hours: 24 });
    expect((await h.post('/v1/auth/verify-email', { token })).status).toBe(400);
  });

  it('US-4.1 / AUTH-10: "Resend verification email" is rate limited to one a minute', async () => {
    const email = uniqueEmail();
    await register(email);
    h.clock.advance({ seconds: 60 });
    expect((await h.post('/v1/auth/resend-verification', { email })).status).toBe(204);
    expect((await h.post('/v1/auth/resend-verification', { email })).status).toBe(429);
    h.clock.advance({ seconds: 60 });
    expect((await h.post('/v1/auth/resend-verification', { email })).status).toBe(204);
  });

  it('US-4.3 / AUTH-02: sign-in gives a short-lived access token and a long-lived rotating refresh token', async () => {
    const email = await h.verifiedAccount();
    const response = await login(email);
    const session = AuthSession.parse(response.body);
    const issued = h.clock.now().epochMilliseconds;
    expect(Date.parse(session.accessTokenExpiresAt) - issued).toBe(15 * 60_000);
    expect(Date.parse(session.refreshTokenExpiresAt) - issued).toBe(30 * 24 * 60 * 60_000);
    const rotated = AuthSession.parse(
      (await h.post('/v1/auth/refresh', { refreshToken: session.refreshToken })).body,
    );
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
  });

  it('US-4.3 / AUTH-02: signing out revokes this device on the server', async () => {
    const email = await h.verifiedAccount();
    const device = await h.signIn(email);
    expect((await h.post('/v1/auth/logout', undefined, { token: device.accessToken })).status).toBe(
      204,
    );
    expect((await h.post('/v1/auth/refresh', { refreshToken: device.refreshToken })).status).toBe(
      401,
    );
    expect((await h.get('/v1/me', { token: device.accessToken })).status).toBe(401);
  });

  it('US-4.1 / AUTH-12 / US-6.1 / TAG-07: on first sign-in the user confirms the timezone and receives the starter tags, which are ordinary tags', async () => {
    const user = await h.signIn(await h.verifiedAccount());
    const response = await h.post(
      '/v1/me/first-sign-in',
      { commandId: randomUUID(), timezone: 'Asia/Dhaka' },
      { token: user.accessToken },
    );
    const result = CompleteFirstSignInResult.parse(response.body);
    expect(result.preferences.timezone).toBe('Asia/Dhaka');
    const byCategory = (category: string) =>
      result.tags.filter((tag) => tag.category === category).map((tag) => tag.name);
    expect(byCategory('productive')).toEqual(['Deep Work', 'Learning']);
    expect(byCategory('neutral')).toEqual(['Meeting', 'Admin', 'Break']);
    expect(byCategory('leisure')).toEqual(['Gaming', 'Social Media']);
    expect(result.tags.find((tag) => tag.name === 'Gaming')?.distractionClass).toBe('gaming');
    expect(result.tags.find((tag) => tag.name === 'Social Media')?.distractionClass).toBe('social');
    // Nothing marks them as special: no flag on the wire, a plain row in the table.
    expect(Object.keys(result.tags[0] ?? {}).sort()).toEqual([
      'archived',
      'category',
      'createdAt',
      'distractionClass',
      'id',
      'name',
      'updatedAt',
    ]);
  });
});
