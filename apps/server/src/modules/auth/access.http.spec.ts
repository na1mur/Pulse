// AUTH-02 (US-4.3), spec 9.1: what an access token opens, logout of this device, and the guard that
// every `auth: 'user'` operation gets from the catalogue. Over real HTTP and PostgreSQL.
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { User, httpOperations } from '@pulse/contract';
import { SignJWT, base64url } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../platform/config/config.testing.js';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import { startAuthHarness, type ApiResponse, type AuthHarness } from './auth.testing.js';

const secret = new TextEncoder().encode(testConfig().jwtSecret);

describe.skipIf(databaseTestsSkipped)('access tokens, auth.getMe and auth.logout (AUTH-02)', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const me = (token?: string, headers?: Record<string, string>): Promise<ApiResponse> =>
    h.get('/v1/me', { ...(token === undefined ? {} : { token }), ...(headers ? { headers } : {}) });

  function expectUnauthenticated(response: ApiResponse): void {
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
  }

  describe('the guard', () => {
    it('answers every operation the catalogue marks as user-only with 401 and no token', async () => {
      const routes = httpOperations().filter(([, operation]) => operation.auth === 'user');
      expect(routes.length).toBeGreaterThan(5);
      const implemented = ['auth.logout', 'auth.getMe', 'auth.completeFirstSignIn'];
      for (const name of implemented) {
        const operation = routes.find(([candidate]) => candidate === name)?.[1];
        expect(operation, name).toBeDefined();
        const response = await h.request(operation?.method ?? 'GET', operation?.path ?? '', {});
        expect(response.status, `${name} without a token`).toBe(401);
      }
    });

    it('opens GET /v1/me with a valid token and answers the User of the contract', async () => {
      const email = await h.verifiedAccount();
      const session = await h.signIn(email);
      const response = await me(session.accessToken);
      expect(response.status).toBe(200);
      const user = User.parse(response.body);
      expect(user).toMatchObject({
        id: session.userId,
        email,
        hasPassword: true,
        googleLinked: false,
      });
      expect(JSON.stringify(response.body)).not.toMatch(/hash|email_key|google_subject/i);
    });

    it('shows each account only itself', async () => {
      const alice = await h.signIn(await h.verifiedAccount());
      const bob = await h.signIn(await h.verifiedAccount());
      expect((await me(alice.accessToken)).body).toMatchObject({ id: alice.userId });
      expect((await me(bob.accessToken)).body).toMatchObject({ id: bob.userId });
    });

    it.each([
      ['no header', undefined],
      ['an empty bearer', 'Bearer '],
      ['a basic credential', 'Basic YWxpY2U6c2VjcmV0'],
      ['two spaces', 'Bearer  token'],
      ['a bare token without the scheme', 'abc.def.ghi'],
      ['garbage', 'Bearer not-a-jwt'],
      ['a huge token', `Bearer ${'a'.repeat(12_000)}`],
    ])('refuses %s', async (_name, header) => {
      expectUnauthenticated(
        await me(undefined, header === undefined ? {} : { Authorization: header }),
      );
    });

    it('ignores a token in the query string or a cookie', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      expectUnauthenticated(await h.get(`/v1/me?access_token=${session.accessToken}`));
      expectUnauthenticated(await me(undefined, { Cookie: `token=${session.accessToken}` }));
    });

    it('accepts the scheme in any letter case, as HTTP says', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      expect((await me(undefined, { Authorization: `bearer ${session.accessToken}` })).status).toBe(
        200,
      );
    });

    it('stops honouring the token at its expiry instant, one millisecond earlier it still works', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      h.clock.advance({ minutes: 14, seconds: 59, milliseconds: 999 });
      expect((await me(session.accessToken)).status).toBe(200);
      h.clock.advance({ milliseconds: 1 });
      expectUnauthenticated(await me(session.accessToken));
    });
  });

  describe('algorithm confusion and forgery (spec 9.1)', () => {
    const claims = async (): Promise<{ sub: string; did: string; fid: string }> => {
      const session = await h.signIn(await h.verifiedAccount());
      const credential = await h.db
        .selectFrom('credentials')
        .select('family_id')
        .where('device_id', '=', session.deviceId)
        .executeTakeFirstOrThrow();
      return { sub: session.userId, did: session.deviceId, fid: credential.family_id };
    };
    const seconds = (): number => Math.floor(h.clock.now().epochMilliseconds / 1000);

    async function sign(
      algorithm: string,
      key: Uint8Array | ReturnType<typeof generateKeyPairSync>['privateKey'],
      payload: { sub: string; did: string; fid: string },
    ): Promise<string> {
      return new SignJWT({ did: payload.did, fid: payload.fid })
        .setProtectedHeader({ alg: algorithm })
        .setSubject(payload.sub)
        .setIssuer('pulse')
        .setAudience('pulse-api')
        .setIssuedAt(seconds())
        .setExpirationTime(seconds() + 900)
        .sign(key);
    }

    it('accepts a token forged here with the right secret and a live family (so the tests below are fair)', async () => {
      const payload = await claims();
      expect((await me(await sign('HS256', secret, payload))).status).toBe(200);
    });

    it('refuses alg none, HS512, the wrong key, the refresh secret and asymmetric algorithms', async () => {
      const payload = await claims();
      const none = `${base64url.encode(JSON.stringify({ alg: 'none' }))}.${base64url.encode(
        JSON.stringify({
          ...payload,
          iss: 'pulse',
          aud: 'pulse-api',
          iat: seconds(),
          exp: seconds() + 900,
        }),
      )}.`;
      const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const forged = [
        none,
        await sign('HS512', secret, payload),
        await sign('HS256', new TextEncoder().encode('0123456789abcdef0123456789abcdef'), payload),
        await sign('HS256', new TextEncoder().encode(testConfig().refreshSecret), payload),
        await sign('RS256', rsa.privateKey, payload),
      ];
      for (const token of forged) expectUnauthenticated(await me(token));
    });

    it("refuses a token that carries someone else's user id with this family (the family decides)", async () => {
      const mine = await claims();
      const other = await claims();
      const confused = await sign('HS256', secret, {
        sub: other.sub,
        did: mine.did,
        fid: mine.fid,
      });
      expectUnauthenticated(await me(confused));
    });

    it('refuses a payload edited after signing', async () => {
      const mine = await claims();
      const other = await claims();
      const token = await sign('HS256', secret, mine);
      const [header, , signature] = token.split('.');
      const edited = base64url.encode(
        JSON.stringify({
          ...other,
          iss: 'pulse',
          aud: 'pulse-api',
          iat: seconds(),
          exp: seconds() + 900,
        }),
      );
      expectUnauthenticated(await me(`${header}.${edited}.${signature}`));
      const body = `${header}.${edited}`;
      // A signature made with a different key over the edited payload.
      const wrong = createHmac('sha256', 'another-key-another-key-another-key')
        .update(body)
        .digest('base64url');
      expectUnauthenticated(await me(`${body}.${wrong}`));
    });
  });

  describe('a revoked device stops working at once', () => {
    it('refuses the access token the moment its credentials are revoked, before it expires', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      expect((await me(session.accessToken)).status).toBe(200);
      await h.db
        .updateTable('credentials')
        .set({ revoked_at: new Date(h.clock.now().epochMilliseconds) })
        .where('device_id', '=', session.deviceId)
        .execute();
      expectUnauthenticated(await me(session.accessToken));
    });

    it('refuses the access token of a device whose row was removed', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      await h.db.deleteFrom('devices').where('id', '=', session.deviceId).execute();
      expectUnauthenticated(await me(session.accessToken));
    });

    it('refuses the access token once the credential has expired even if the token has not', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      await h.db
        .updateTable('credentials')
        .set({ expires_at: new Date(h.clock.now().epochMilliseconds) })
        .where('device_id', '=', session.deviceId)
        .execute();
      expectUnauthenticated(await me(session.accessToken));
    });
  });

  describe('auth.logout (AUTH-02, US-4.3)', () => {
    it("revokes this device's credentials on the server: its refresh and access tokens stop, answering 204", async () => {
      const email = await h.verifiedAccount();
      const laptop = await h.signIn(email);
      const phone = await h.signIn(email);
      const response = await h.post('/v1/auth/logout', undefined, { token: laptop.accessToken });
      expect(response.status).toBe(204);
      expect(response.text).toBe('');

      expectUnauthenticated(await me(laptop.accessToken));
      expect((await h.post('/v1/auth/refresh', { refreshToken: laptop.refreshToken })).status).toBe(
        401,
      );
      const rows = await h.db
        .selectFrom('credentials')
        .select('revoked_at')
        .where('device_id', '=', laptop.deviceId)
        .execute();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.revoked_at !== null)).toBe(true);
      // The other device is signed in still.
      expect((await me(phone.accessToken)).status).toBe(200);
      expect((await h.post('/v1/auth/refresh', { refreshToken: phone.refreshToken })).status).toBe(
        200,
      );
    });

    it('stops pushes to a signed-out device and keeps the device in the list for the next sign-in', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      await h.db
        .updateTable('devices')
        .set({ push_token: 'fcm-token-123' })
        .where('id', '=', session.deviceId)
        .execute();
      await h.post('/v1/auth/logout', undefined, { token: session.accessToken });
      const device = await h.db
        .selectFrom('devices')
        .selectAll()
        .where('id', '=', session.deviceId)
        .executeTakeFirstOrThrow();
      expect(device.push_token).toBeNull();
    });

    it('answers 401 to a second logout with the same token', async () => {
      const session = await h.signIn(await h.verifiedAccount());
      expect(
        (await h.post('/v1/auth/logout', undefined, { token: session.accessToken })).status,
      ).toBe(204);
      expectUnauthenticated(
        await h.post('/v1/auth/logout', undefined, { token: session.accessToken }),
      );
    });

    it('needs a token', async () => {
      expectUnauthenticated(await h.post('/v1/auth/logout'));
    });

    it('lets the same install sign in again afterwards', async () => {
      const email = await h.verifiedAccount();
      const first = await h.signIn(email);
      await h.post('/v1/auth/logout', undefined, { token: first.accessToken });
      const again = await h.signIn(email, { deviceId: first.deviceId });
      expect((await me(again.accessToken)).status).toBe(200);
      expectUnauthenticated(await me(first.accessToken));
    });
  });

  it('puts the signed-in user on the log lines of the request', async () => {
    const session = await h.signIn(await h.verifiedAccount());
    h.logs.length = 0;
    await me(session.accessToken);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const access = h.logs
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry['context'] === 'Http' && entry['route'] === '/v1/me');
    expect(access?.['userId']).toBe(session.userId);
    expect(h.logs.join('\n')).not.toContain(session.accessToken);
  });
});
