import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, decodeProtectedHeader, jwtVerify } from 'jose';
import { formatInstantMillis } from '../../domain/time/index.js';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '../../domain/auth/lifetimes.js';
import { CLOCK, type Clock } from '../../platform/clock/clock.js';
import type { AppConfig } from '../../platform/config/app-config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';

/** What an access token says about its holder; all three are server-generated UUIDs. */
export interface AccessTokenClaims {
  readonly userId: string;
  readonly deviceId: string;
  /** The refresh-credential family it was issued with: revoking the family ends the token. */
  readonly familyId: string;
}

const ISSUER = 'pulse';
const AUDIENCE = 'pulse-api';
const ALGORITHM = 'HS256';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
// A real token is about 330 characters; a longer one is not worth parsing.
const MAX_TOKEN_LENGTH = 2048;

/**
 * Short-lived signed access tokens (D-13, spec 9.1). HS256 with `JWT_SECRET`, and only that:
 * verification names the one accepted algorithm (no `none`, no other HMAC size, no asymmetric
 * algorithm that could be confused with the secret), the issuer and the audience, and refuses a
 * header with anything beyond `alg` and `typ` (no `crit`, `jku`, `jwk`, `kid`). Time comes from
 * the injected clock, with no leeway: the expiry instant itself is already too late.
 *
 * The token proves who signed in and on which device; it does not prove that the device is still
 * signed in. The auth guard checks that against the database on every request.
 */
@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(config.jwtSecret);
  }

  /** Signs a token valid for 15 minutes from now; `expiresAt` is that instant. */
  async issue(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: string }> {
    const now = this.clock.now();
    const issuedAt = Math.floor(now.epochMilliseconds / 1000);
    const expiresAtSeconds = issuedAt + ACCESS_TOKEN_LIFETIME_SECONDS;
    const token = await new SignJWT({ did: claims.deviceId, fid: claims.familyId })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.key);
    return {
      token,
      expiresAt: formatInstantMillis(now.add({ seconds: ACCESS_TOKEN_LIFETIME_SECONDS })),
    };
  }

  /** The token's claims, or undefined for anything that is not a valid, current Pulse token. */
  async verify(token: string): Promise<AccessTokenClaims | undefined> {
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return undefined;
    try {
      const header = decodeProtectedHeader(token);
      if (Object.keys(header).some((name) => name !== 'alg' && name !== 'typ')) return undefined;
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: new Date(this.clock.now().epochMilliseconds),
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      const { sub, did, fid } = payload;
      if (!isUuid(sub) || !isUuid(did) || !isUuid(fid)) return undefined;
      return { userId: sub, deviceId: did, familyId: fid };
    } catch {
      // Any failure (signature, algorithm, claim, expiry, malformed) is the same answer.
      return undefined;
    }
  }
}
