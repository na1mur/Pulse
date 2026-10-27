// D-13, spec 9.1: refresh rotation with reuse detection. A rotated token that comes back is a
// stolen token: the whole family and the device are revoked. Over real HTTP and PostgreSQL.
import { AuthSession } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newToken } from './new-token.js';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import {
  containsToken,
  dumpDatabaseText,
  startAuthHarness,
  type ApiResponse,
  type AuthHarness,
} from './auth.testing.js';

describe.skipIf(databaseTestsSkipped)('auth.refresh (D-13, AUTH-02)', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const refresh = (refreshToken: string, ip?: string): Promise<ApiResponse> =>
    h.post('/v1/auth/refresh', { refreshToken }, ip === undefined ? {} : { ip });
  const me = (token: string): Promise<ApiResponse> => h.get('/v1/me', { token });
  const activeCredentials = (deviceId: string) =>
    h.db
      .selectFrom('credentials')
      .select(['id', 'family_id'])
      .where('device_id', '=', deviceId)
      .where('revoked_at', 'is', null)
      .execute();

  /** The identical refusal every unusable token gets. */
  function expectRefused(response: ApiResponse): void {
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
  }

  it('rotates: a new pair for the same device and family, the old token spent, the lifetime extended', async () => {
    const email = await h.verifiedAccount();
    const first = await h.signIn(email);
    h.clock.advance({ hours: 24 * 20 });
    const response = await refresh(first.refreshToken);
    expect(response.status).toBe(200);
    const session = AuthSession.parse(response.body);
    expect(session.refreshToken).not.toBe(first.refreshToken);
    expect(session.accessToken).not.toBe(first.accessToken);
    // D-13: extended with use. 20 days in, the new credential lives 30 days from now.
    expect(session.refreshTokenExpiresAt).toBe('2026-12-16T10:00:00.000Z');
    expect(session.accessTokenExpiresAt).toBe('2026-11-16T10:15:00.000Z');
    expect(session.user.email).toBe(email);

    const rows = await h.db
      .selectFrom('credentials')
      .selectAll()
      .where('device_id', '=', first.deviceId)
      .orderBy('issued_at')
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.revoked_at).not.toBeNull();
    expect(rows[1]?.revoked_at).toBeNull();
    expect(rows[1]?.family_id).toBe(rows[0]?.family_id);
    // The new access token works; the old one is the same family, so it works until it expires.
    expect((await me(session.accessToken)).status).toBe(200);
  });

  it('keeps a device signed in indefinitely while it keeps refreshing', async () => {
    const email = await h.verifiedAccount();
    let current = await h.signIn(email);
    for (let week = 0; week < 8; week += 1) {
      h.clock.advance({ hours: 24 * 20 });
      const response = await refresh(current.refreshToken);
      expect(response.status).toBe(200);
      current = {
        ...current,
        refreshToken: (response.body as { refreshToken: string }).refreshToken,
      };
    }
  });

  describe('reuse detection', () => {
    it('revokes the family and the device when a rotated token comes back', async () => {
      const email = await h.verifiedAccount();
      const first = await h.signIn(email);
      const second = AuthSession.parse((await refresh(first.refreshToken)).body);
      const third = AuthSession.parse((await refresh(second.refreshToken)).body);

      // The thief (or a confused client) replays the first token.
      expectRefused(await refresh(first.refreshToken));

      // Everything the family issued is dead: the newest refresh token and its access token.
      expectRefused(await refresh(third.refreshToken));
      expect((await me(third.accessToken)).status).toBe(401);
      expect(await activeCredentials(first.deviceId)).toHaveLength(0);
    });

    it('leaves the same account on its other devices alone', async () => {
      const email = await h.verifiedAccount();
      const laptop = await h.signIn(email);
      const phone = await h.signIn(email);
      const rotated = AuthSession.parse((await refresh(laptop.refreshToken)).body);
      expectRefused(await refresh(laptop.refreshToken));
      expect((await refresh(rotated.refreshToken)).status).toBe(401);
      expect((await me(phone.accessToken)).status).toBe(200);
      expect((await refresh(phone.refreshToken)).status).toBe(200);
    });

    it("does not let one account touch another account's credentials by replaying its own", async () => {
      const alice = await h.signIn(await h.verifiedAccount());
      const bob = await h.signIn(await h.verifiedAccount());
      const rotated = AuthSession.parse((await refresh(alice.refreshToken)).body);
      await refresh(alice.refreshToken);
      expect((await me(bob.accessToken)).status).toBe(200);
      expect((await refresh(bob.refreshToken)).status).toBe(200);
      expect(rotated.refreshToken).not.toBe(bob.refreshToken);
    });

    it('writes the reuse to the log with the account and no token', async () => {
      const email = await h.verifiedAccount();
      const first = await h.signIn(email);
      h.logs.length = 0;
      await refresh(first.refreshToken);
      await refresh(first.refreshToken);
      const line = h.logs
        .map((entry) => JSON.parse(entry) as Record<string, unknown>)
        .find((entry) => String(entry['message']).includes('reuse'));
      expect(line).toBeDefined();
      expect(line?.['userId']).toBe(first.userId);
      expect(containsToken(h.logs.join('\n'), first.refreshToken)).toBe(false);
    });

    it('logs one reuse for one theft, not one per later attempt, and none for a plain refresh after sign-out', async () => {
      const email = await h.verifiedAccount();
      const first = await h.signIn(email);
      const second = AuthSession.parse((await refresh(first.refreshToken)).body);
      h.logs.length = 0;
      await refresh(first.refreshToken);
      await refresh(first.refreshToken);
      await refresh(second.refreshToken);
      const reuses = () => h.logs.filter((line) => line.includes('reuse'));
      expect(reuses()).toHaveLength(1);

      const other = await h.signIn(await h.verifiedAccount());
      await h.post('/v1/auth/logout', undefined, { token: other.accessToken });
      h.logs.length = 0;
      expectRefused(await refresh(other.refreshToken));
      expect(reuses()).toHaveLength(0);
    });

    it('lets exactly one of many concurrent refreshes with one token win, and revokes the family', async () => {
      const email = await h.verifiedAccount();
      const first = await h.signIn(email);
      const answers = await Promise.all(
        Array.from({ length: 8 }, () => refresh(first.refreshToken)),
      );
      const winners = answers.filter((answer) => answer.status === 200);
      expect(winners).toHaveLength(1);
      for (const loser of answers.filter((answer) => answer.status !== 200)) expectRefused(loser);

      // The losers' replay is reuse: the winner's new credential died with the family.
      const winner = AuthSession.parse(winners[0]?.body);
      expectRefused(await refresh(winner.refreshToken));
      expect(await activeCredentials(first.deviceId)).toHaveLength(0);
    });
  });

  describe('refusals', () => {
    it('refuses unknown, malformed and oversized tokens with the one answer', async () => {
      for (const token of [
        newToken(),
        'x',
        'a'.repeat(512),
        ' ',
        'not a token at all',
        '\u0000',
        "' or 1=1 --",
      ]) {
        expectRefused(await refresh(token));
      }
      for (const token of ['', 'a'.repeat(513)]) {
        expect((await refresh(token)).status).toBe(400);
      }
    });

    it('refuses an expired credential without touching the others, and an access token used as a refresh token', async () => {
      const email = await h.verifiedAccount();
      const first = await h.signIn(email);
      h.clock.advance({ hours: 24 * 10 });
      const other = await h.signIn(email);
      expectRefused(await refresh(first.accessToken));
      h.clock.advance({ hours: 24 * 25 });
      expectRefused(await refresh(first.refreshToken));
      expect((await refresh(other.refreshToken)).status).toBe(200);
    });

    it('accepts the credential until its last millisecond and refuses it from the expiry instant', async () => {
      const email = await h.verifiedAccount();
      const early = await h.signIn(email);
      const late = await h.signIn(email);
      h.clock.advance({ hours: 24 * 30 });
      h.clock.advance({ milliseconds: -1 });
      expect((await refresh(early.refreshToken)).status).toBe(200);
      h.clock.advance({ milliseconds: 1 });
      expectRefused(await refresh(late.refreshToken));
    });

    it('refuses a token whose credential was deleted with its account', async () => {
      const email = await h.verifiedAccount();
      const session = await h.signIn(email);
      await h.db.deleteFrom('users').where('id', '=', session.userId).execute();
      expectRefused(await refresh(session.refreshToken));
      expect((await me(session.accessToken)).status).toBe(401);
    });

    it('rejects unknown fields and a missing token as VALIDATION', async () => {
      expect((await h.post('/v1/auth/refresh', {})).status).toBe(400);
      expect(
        (await h.post('/v1/auth/refresh', { refreshToken: newToken(), deviceId: 'x' })).status,
      ).toBe(400);
    });

    it('is limited per client to 60 in 15 minutes', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 62; attempt += 1) {
        statuses.push((await refresh(newToken(), '203.0.113.99')).status);
      }
      expect(statuses.slice(0, 60)).toEqual(Array<number>(60).fill(401));
      expect(statuses.slice(60)).toEqual([429, 429]);
    });
  });

  it('never echoes a presented credential in an error body', async () => {
    const oversized = `${'b'.repeat(40)}${'c'.repeat(520)}`;
    const unknown = newToken();
    for (const [token, status] of [
      [oversized, 400],
      [unknown, 401],
    ] as const) {
      const response = await refresh(token);
      expect(response.status).toBe(status);
      expect(response.text).not.toContain(token.slice(0, 30));
    }
    const wrongType = await h.post('/v1/auth/refresh', { refreshToken: { token: unknown } });
    expect(wrongType.status).toBe(400);
    expect(wrongType.text).not.toContain(unknown);
  });

  it('never stores or logs a raw credential, however many times it rotates', async () => {
    const email = await h.verifiedAccount();
    const first = await h.signIn(email);
    const tokens = [first.refreshToken, first.accessToken];
    let current = first.refreshToken;
    for (let round = 0; round < 3; round += 1) {
      const session = AuthSession.parse((await refresh(current)).body);
      tokens.push(session.refreshToken, session.accessToken);
      current = session.refreshToken;
    }
    await refresh(first.refreshToken);
    const stored = await dumpDatabaseText(h.db);
    expect(h.logs.length).toBeGreaterThan(0); // what is absent below was written to
    const logs = h.logs.join('\n');
    for (const token of tokens) {
      expect(containsToken(stored, token)).toBe(false);
      expect(containsToken(logs, token)).toBe(false);
    }
  });
});
