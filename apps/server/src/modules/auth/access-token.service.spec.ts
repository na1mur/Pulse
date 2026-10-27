import { createHmac, generateKeyPairSync } from 'node:crypto';
import { SignJWT, base64url } from 'jose';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../platform/clock/fake-clock.js';
import { testConfig } from '../../platform/config/config.testing.js';
import { AccessTokenService } from './access-token.service.js';

const CLAIMS = {
  userId: '0192f0c0-0000-7000-8000-000000000001',
  deviceId: '0192f0c0-0000-7000-8000-000000000002',
  familyId: '0192f0c0-0000-7000-8000-000000000003',
};
const NOW = '2026-10-27T10:00:00Z';

const config = testConfig();
const secret = new TextEncoder().encode(config.jwtSecret);

function service(clock = new FakeClock(NOW)): { clock: FakeClock; tokens: AccessTokenService } {
  return { clock, tokens: new AccessTokenService(config, clock) };
}

/** A token as the service would sign it, with one thing changed. */
function craft(
  algorithm: string,
  key: Uint8Array | ReturnType<typeof generateKeyPairSync>['privateKey'],
  overrides: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): Promise<string> {
  const seconds = Date.parse(NOW) / 1000;
  return new SignJWT({ did: CLAIMS.deviceId, fid: CLAIMS.familyId, ...overrides })
    .setProtectedHeader({ alg: algorithm, ...header })
    .setSubject(CLAIMS.userId)
    .setIssuer('pulse')
    .setAudience('pulse-api')
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 900)
    .sign(key);
}

describe('AccessTokenService (D-13: HS256, 15 minutes)', () => {
  it('issues a token that verifies back to its claims and says when it expires', async () => {
    const { tokens } = service();
    const { token, expiresAt } = await tokens.issue(CLAIMS);
    expect(expiresAt).toBe('2026-10-27T10:15:00.000Z');
    await expect(tokens.verify(token)).resolves.toEqual(CLAIMS);
  });

  it('is HS256 with the standard claims and nothing personal in it', async () => {
    const { tokens } = service();
    const { token } = await tokens.issue(CLAIMS);
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map(
        (part) =>
          JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>,
      );
    expect(header).toEqual({ alg: 'HS256' });
    expect(Object.keys(payload ?? {}).sort()).toEqual([
      'aud',
      'did',
      'exp',
      'fid',
      'iat',
      'iss',
      'sub',
    ]);
  });

  it('accepts the token up to the last second and refuses it from the expiry instant on', async () => {
    const { clock, tokens } = service();
    const { token } = await tokens.issue(CLAIMS);
    clock.set('2026-10-27T10:14:59.999Z');
    await expect(tokens.verify(token)).resolves.toEqual(CLAIMS);
    clock.set('2026-10-27T10:15:00Z');
    await expect(tokens.verify(token)).resolves.toBeUndefined();
  });

  describe('algorithm confusion and forgery', () => {
    it('refuses alg none, with and without a signature part', async () => {
      const { tokens } = service();
      const header = base64url.encode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
      const seconds = Date.parse(NOW) / 1000;
      const payload = base64url.encode(
        JSON.stringify({
          sub: CLAIMS.userId,
          did: CLAIMS.deviceId,
          fid: CLAIMS.familyId,
          iss: 'pulse',
          aud: 'pulse-api',
          iat: seconds,
          exp: seconds + 900,
        }),
      );
      await expect(tokens.verify(`${header}.${payload}.`)).resolves.toBeUndefined();
      await expect(tokens.verify(`${header}.${payload}`)).resolves.toBeUndefined();
      await expect(tokens.verify(`${header}.${payload}.AAAA`)).resolves.toBeUndefined();
    });

    it('refuses HS512 and HS384 even when signed with the right secret', async () => {
      const { tokens } = service();
      await expect(tokens.verify(await craft('HS512', secret))).resolves.toBeUndefined();
      await expect(tokens.verify(await craft('HS384', secret))).resolves.toBeUndefined();
    });

    it('refuses HS256 signed with another key, the refresh secret included', async () => {
      const { tokens } = service();
      const wrong = new TextEncoder().encode('another-secret-another-secret-12345');
      const refresh = new TextEncoder().encode(config.refreshSecret);
      await expect(tokens.verify(await craft('HS256', wrong))).resolves.toBeUndefined();
      await expect(tokens.verify(await craft('HS256', refresh))).resolves.toBeUndefined();
    });

    it('refuses an asymmetric token (RS256, ES256) however it was made', async () => {
      const { tokens } = service();
      const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      await expect(tokens.verify(await craft('RS256', rsa.privateKey))).resolves.toBeUndefined();
      await expect(tokens.verify(await craft('ES256', ec.privateKey))).resolves.toBeUndefined();
    });

    it('refuses a token whose payload was edited after signing', async () => {
      const { tokens } = service();
      const { token } = await tokens.issue(CLAIMS);
      const [header, , signature] = token.split('.');
      const payload = base64url.encode(
        JSON.stringify({
          sub: '0192f0c0-0000-7000-8000-0000000000ff',
          did: CLAIMS.deviceId,
          fid: CLAIMS.familyId,
          iss: 'pulse',
          aud: 'pulse-api',
          iat: 1_792_000_000,
          exp: 4_000_000_000,
        }),
      );
      await expect(tokens.verify(`${header}.${payload}.${signature}`)).resolves.toBeUndefined();
    });

    it('refuses a token that names another issuer or audience', async () => {
      const { tokens } = service();
      const seconds = Date.parse(NOW) / 1000;
      const sign = (issuer: string, audience: string): Promise<string> =>
        new SignJWT({ did: CLAIMS.deviceId, fid: CLAIMS.familyId })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(CLAIMS.userId)
          .setIssuer(issuer)
          .setAudience(audience)
          .setIssuedAt(seconds)
          .setExpirationTime(seconds + 900)
          .sign(secret);
      await expect(tokens.verify(await sign('someone-else', 'pulse-api'))).resolves.toBeUndefined();
      await expect(tokens.verify(await sign('pulse', 'someone-else'))).resolves.toBeUndefined();
    });

    it('refuses a token without an expiry, or with identifiers that are not UUIDs', async () => {
      const { tokens } = service();
      const noExpiry = await new SignJWT({ did: CLAIMS.deviceId, fid: CLAIMS.familyId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(CLAIMS.userId)
        .setIssuer('pulse')
        .setAudience('pulse-api')
        .sign(secret);
      await expect(tokens.verify(noExpiry)).resolves.toBeUndefined();
      await expect(
        tokens.verify(await craft('HS256', secret, { did: "x'; drop table users;--" })),
      ).resolves.toBeUndefined();
      await expect(
        tokens.verify(await craft('HS256', secret, { fid: 7 })),
      ).resolves.toBeUndefined();
      await expect(
        tokens.verify(await craft('HS256', secret, { fid: undefined })),
      ).resolves.toBeUndefined();
    });

    it('refuses a header that asks for critical extensions or names a key location', async () => {
      const { tokens } = service();
      // Signed by hand with the right secret: a signing library refuses to write such headers.
      const seconds = Date.parse(NOW) / 1000;
      const forge = (header: Record<string, unknown>): string => {
        const body = [
          header,
          {
            sub: CLAIMS.userId,
            did: CLAIMS.deviceId,
            fid: CLAIMS.familyId,
            iss: 'pulse',
            aud: 'pulse-api',
            iat: seconds,
            exp: seconds + 900,
          },
        ]
          .map((part) => base64url.encode(JSON.stringify(part)))
          .join('.');
        return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
      };
      await expect(tokens.verify(forge({ alg: 'HS256' }))).resolves.toEqual(CLAIMS);
      await expect(tokens.verify(forge({ alg: 'HS256', typ: 'JWT' }))).resolves.toEqual(CLAIMS);
      await expect(tokens.verify(forge({ alg: 'HS256', crit: ['exp'] }))).resolves.toBeUndefined();
      await expect(
        tokens.verify(forge({ alg: 'HS256', jku: 'https://evil.example/keys' })),
      ).resolves.toBeUndefined();
      await expect(tokens.verify(forge({ alg: 'HS256', kid: 'other' }))).resolves.toBeUndefined();
    });
  });

  it.each(['', 'abc', 'a.b', 'a.b.c', 'a.b.c.d', 'x'.repeat(5000), ' ', '\u0000'])(
    'answers undefined, never throws, for garbage (%j)',
    async (garbage) => {
      const { tokens } = service();
      await expect(tokens.verify(garbage)).resolves.toBeUndefined();
    },
  );
});
