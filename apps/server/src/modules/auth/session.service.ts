import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OperationBody, OperationResponse } from '@pulse/contract';
import { randomUUID } from 'node:crypto';
import { REFRESH_TOKEN_LIFETIME_SECONDS } from '../../domain/auth/lifetimes.js';
import { hashRefreshToken } from '../../domain/auth/tokens.js';
import { emailKey } from '../../domain/email-key.js';
import { formatInstantMillis } from '../../domain/time/index.js';
import { CLOCK, formatNow, type Clock } from '../../platform/clock/clock.js';
import type { AppConfig } from '../../platform/config/app-config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';
import { UnitOfWork, type Executor } from '../../platform/database/unit-of-work.js';
import { AppError } from '../../platform/errors/app-error.js';
import { setLogUser } from '../../platform/logging/log-context.js';
import { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import { AccessTokenService } from './access-token.service.js';
import { unauthenticated } from './auth-errors.js';
import { AUTH_LIMITS, accountLimitKey } from './auth-limits.js';
import { newToken } from './new-token.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionsRepository } from './sessions.repository.js';
import { toUser } from './user.mapper.js';
import { UsersRepository, type UserRow } from './users.repository.js';

type Session = OperationResponse<'auth.login'>;

/** Who is signed in and where: what the access token proves and the guard re-checks. */
export interface SignedInDevice {
  readonly userId: string;
  readonly deviceId: string;
  readonly familyId: string;
}

/**
 * Signing in, rotating credentials and signing out (AUTH-02, D-13, spec 9.1). Rules in force:
 * login errors are identical for an unknown email and a wrong password, in body and in time (one
 * Argon2id verification either way); only the right password on an unverified account is told
 * apart (FORBIDDEN, D-31); refresh credentials are single-use and a spent one that comes back
 * revokes everything the device holds; the database stores hashes only.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly hasher: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** AUTH-02: signs in on a device. See the class note for what is and is not revealed. */
  async login(body: OperationBody<'auth.login'>, client: string): Promise<Session> {
    this.limiter.enforce(AUTH_LIMITS.loginPerClient, client);
    const key = emailKey(body.email);
    const accountKey = accountLimitKey(key);
    // Counted as a failure before any work, and given back only by the right password (QA T1.5
    // bug 1): counted after the hash, every guess that arrived while the first one was hashing
    // passed the check. Before any work, and the same for unknown addresses: a blocked account
    // answers 429 whether or not it exists, and a guess costs the attacker the limit, not us a hash.
    this.limiter.enforce(AUTH_LIMITS.loginFailuresPerAccount, accountKey);

    const user = await this.users.findByEmailKey(this.unitOfWork.pool, key);
    const passwordMatches = await this.hasher.verify(body.password, user?.password_hash ?? null);
    if (user === undefined || !passwordMatches) {
      throw unauthenticated();
    }
    this.limiter.reset(AUTH_LIMITS.loginFailuresPerAccount, accountKey);
    if (user.email_verified_at === null) {
      // D-31: the password was right, so saying why the sign-in fails reveals nothing new.
      throw new AppError('FORBIDDEN', 'Verify your email address before signing in.');
    }
    setLogUser(user.id);

    const issued = await this.unitOfWork.run(async (transaction) => {
      const now = formatNow(this.clock);
      const { device } = body;
      await this.sessions.lockDevice(transaction, device.id);
      await this.sessions.deleteDeviceOfOtherUser(transaction, device.id, user.id);
      await this.sessions.upsertDevice(transaction, user.id, device, now);
      // One live sign-in per device: signing in again retires what the install held before.
      await this.sessions.revokeDevice(transaction, device.id, user.id, now);
      return this.startFamily(transaction, user.id, device.id);
    });
    return this.session(user, issued);
  }

  /**
   * D-13: spends the presented refresh credential and issues its successor. A credential that was
   * already spent (rotated, or revoked by sign-out) and is presented again is reuse: the device
   * loses every credential it holds, because two parties now hold the same secret and the server
   * cannot tell which is the owner.
   */
  async refresh(body: OperationBody<'auth.refresh'>, client: string): Promise<Session> {
    this.limiter.enforce(AUTH_LIMITS.refreshPerClient, client);
    const presentedHash = hashRefreshToken(this.config.refreshSecret, body.refreshToken);
    const outcome = await this.unitOfWork.run(async (transaction) => {
      const next = this.newCredential();
      const rotated = await this.sessions.rotate(transaction, presentedHash, {
        id: randomUUID(),
        tokenHash: hashRefreshToken(this.config.refreshSecret, next.token),
        now: next.now,
        expiresAt: next.expiresAt,
      });
      if (rotated !== undefined) {
        await this.sessions.touchDevice(transaction, rotated.deviceId, next.now);
        const user = await this.users.findById(transaction, rotated.userId);
        return user === undefined
          ? ({ kind: 'refused' } as const)
          : ({ kind: 'rotated', user, rotated, next } as const);
      }
      const known = await this.sessions.findByHash(transaction, presentedHash);
      // Unknown, or still valid but past its expiry: refused, nothing else is touched.
      if (known === undefined || known.revokedAt === null) return { kind: 'refused' } as const;
      const revoked = await this.sessions.revokeDevice(
        transaction,
        known.deviceId,
        known.userId,
        next.now,
      );
      // A spent token presented after the device was already signed out ends nothing new: refused,
      // not worth an alarm. Reuse is when something was still live to revoke.
      return revoked > 0
        ? ({ kind: 'reuse', userId: known.userId } as const)
        : ({ kind: 'refused' } as const);
    });

    if (outcome.kind === 'reuse') {
      setLogUser(outcome.userId);
      this.logger.warn(
        'Refresh credential reuse detected: every credential of the device was revoked.',
      );
    }
    if (outcome.kind !== 'rotated') throw unauthenticated();
    setLogUser(outcome.user.id);
    return this.session(outcome.user, {
      deviceId: outcome.rotated.deviceId,
      familyId: outcome.rotated.familyId,
      refreshToken: outcome.next.token,
      refreshExpiresAt: outcome.next.expiresAt,
    });
  }

  /** AUTH-02: signs this device out; its credentials stop working at once and it gets no pushes. */
  async logout(signedIn: SignedInDevice): Promise<undefined> {
    await this.unitOfWork.run(async (transaction) => {
      await this.sessions.revokeDevice(
        transaction,
        signedIn.deviceId,
        signedIn.userId,
        formatNow(this.clock),
      );
      await this.sessions.clearPushToken(transaction, signedIn.deviceId);
    });
    return undefined;
  }

  /**
   * Whether the device an access token was issued to is still signed in: its credential family
   * holds an unrevoked, unexpired credential. Asked on every authenticated request (the guard), so
   * sign-out, revocation and reuse detection apply at once, not when the token expires.
   */
  isSignedIn(claims: SignedInDevice): Promise<boolean> {
    return this.sessions.isFamilyActive(this.unitOfWork.pool, claims, formatNow(this.clock));
  }

  /** A new family on a device: its first refresh credential. Call inside the sign-in transaction. */
  private async startFamily(transaction: Executor, userId: string, deviceId: string) {
    const credential = this.newCredential();
    const familyId = randomUUID();
    await this.sessions.insertCredential(transaction, {
      id: randomUUID(),
      deviceId,
      userId,
      tokenHash: hashRefreshToken(this.config.refreshSecret, credential.token),
      familyId,
      now: credential.now,
      expiresAt: credential.expiresAt,
    });
    return {
      deviceId,
      familyId,
      refreshToken: credential.token,
      refreshExpiresAt: credential.expiresAt,
    };
  }

  private newCredential(): { token: string; now: string; expiresAt: string } {
    const instant = this.clock.now();
    return {
      token: newToken(),
      now: formatInstantMillis(instant),
      expiresAt: formatInstantMillis(instant.add({ seconds: REFRESH_TOKEN_LIFETIME_SECONDS })),
    };
  }

  private async session(
    user: UserRow,
    issued: { deviceId: string; familyId: string; refreshToken: string; refreshExpiresAt: string },
  ): Promise<Session> {
    const access = await this.accessTokens.issue({
      userId: user.id,
      deviceId: issued.deviceId,
      familyId: issued.familyId,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: issued.refreshToken,
      refreshTokenExpiresAt: issued.refreshExpiresAt,
      user: toUser(user),
    };
  }
}
