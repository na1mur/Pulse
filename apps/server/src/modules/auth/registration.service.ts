import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OperationBody } from '@pulse/contract';
import { randomUUID } from 'node:crypto';
import { VERIFY_EMAIL_TOKEN_LIFETIME_SECONDS } from '../../domain/auth/lifetimes.js';
import { hashEmailToken } from '../../domain/auth/tokens.js';
import { emailKey } from '../../domain/email-key.js';
import { formatInstantMillis } from '../../domain/time/index.js';
import { MailService } from '../../mail/mail.service.js';
import { isSafeMailAddress } from '../../mail/mail-address.js';
import { isMailToken } from '../../mail/mail-links.js';
import { BackgroundTasks } from '../../platform/async/background-tasks.js';
import { holdUntil } from '../../platform/async/hold-until.js';
import { CLOCK, formatNow, type Clock } from '../../platform/clock/clock.js';
import type { AppConfig } from '../../platform/config/app-config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';
import { isUniqueViolation } from '../../platform/database/pg-errors.js';
import { UnitOfWork, type Executor } from '../../platform/database/unit-of-work.js';
import { AppError, invalidRequest } from '../../platform/errors/app-error.js';
import { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import { RevisionService } from '../../platform/revisions/revision.service.js';
import { PreferencesRepository } from '../preferences/preferences.repository.js';
import { AUTH_LIMITS, accountLimitKey } from './auth-limits.js';
import { EmailTokensRepository } from './email-tokens.repository.js';
import { newToken } from './new-token.js';
import { PasswordHasher } from './password-hasher.js';
import { UsersRepository } from './users.repository.js';

/** The one answer for a link that cannot be used, whatever the reason (spec 9.1). */
export const INVALID_LINK_MESSAGE = 'The link is invalid or has expired.';

interface Issued {
  readonly address: string;
  readonly token: string;
}

/**
 * Sign-up and email verification (AUTH-01, AUTH-10, US-4.1). The rule that shapes everything
 * here is spec 9.1: nothing a caller can observe may depend on whether an address already has an
 * account. So `register` and `resendVerification` answer the same (204, or the same 429) for new,
 * pending and verified addresses; the work that differs (reading the account, writing a token,
 * sending the mail) happens after the answer or costs no more than the password hash every
 * sign-up pays; and mail goes out after the commit, in the background.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly users: UsersRepository,
    private readonly emailTokens: EmailTokensRepository,
    private readonly preferences: PreferencesRepository,
    private readonly revisions: RevisionService,
    private readonly hasher: PasswordHasher,
    private readonly limiter: RateLimiter,
    private readonly mail: MailService,
    private readonly background: BackgroundTasks,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * AUTH-01: creates the account, its revision counter and its default preferences in one
   * transaction, then mails the verification link. An address that is already verified changes
   * nothing and mails nothing; one that is still unverified takes the new password (D-34: the
   * latest sign-up of an unconfirmed address wins, so someone who registered another person's
   * address first cannot keep the account) and a new link, at most once a minute.
   */
  async register(body: OperationBody<'auth.register'>, client: string): Promise<undefined> {
    this.limiter.enforce(AUTH_LIMITS.registerPerClient, client);
    const address = requireMailAddress(body.email);
    const startedAt = performance.now();
    // Every path pays for exactly one hash, so time does not tell the paths apart.
    const passwordHash = await this.hasher.hash(body.password);
    const key = emailKey(address);
    // Counted once per sign-up, before the account is read and whatever it turns out to be: the
    // resend limit is observable (a "resend" right after answers 429), so it must not depend on
    // whether the address is new, pending or verified.
    const mayMail = this.limiter.hit(AUTH_LIMITS.resendPerAccount, accountLimitKey(key)).allowed;
    const issued = await this.createOrRefresh(address, key, passwordHash, mayMail);
    if (issued) this.sendVerificationMail(issued);
    // A new address costs a few more writes than an existing one: hold both to one duration.
    await holdUntil(startedAt, this.config.limits.authResponseFloorMs);
    return undefined;
  }

  /** AUTH-10: asks for a new link. The answer is the same for every address; see the class note. */
  resendVerification(body: OperationBody<'auth.resendVerification'>, client: string): undefined {
    this.limiter.enforce(AUTH_LIMITS.resendPerClient, client);
    const address = requireMailAddress(body.email);
    const key = emailKey(address);
    // Counted for unknown and verified addresses too: a 429 must not mean "this one exists".
    this.limiter.enforce(AUTH_LIMITS.resendPerAccount, accountLimitKey(key));
    this.background.run('resend verification', async () => {
      const user = await this.users.findByEmailKey(this.unitOfWork.pool, key);
      if (user?.email_verified_at !== null) return;
      const issued = await this.unitOfWork.run((transaction) =>
        this.issueToken(transaction, user.id, user.email),
      );
      this.sendVerificationMail(issued);
    });
  }

  /**
   * AUTH-10: uses a verification link. Expired, used, unknown, malformed and other-purpose
   * tokens are all refused with the same error; single use is one atomic statement, so of any
   * number of concurrent clicks exactly one wins.
   */
  async verifyEmail(token: string, client: string): Promise<undefined> {
    this.limiter.enforce(AUTH_LIMITS.verifyPerClient, client);
    if (!isMailToken(token)) throw invalidLink();
    const tokenHash = hashEmailToken(token);
    const verified = await this.unitOfWork.run(async (transaction) => {
      const now = formatNow(this.clock);
      const consumed = await this.emailTokens.consume(transaction, tokenHash, 'verify_email', now);
      if (consumed === undefined) return false;
      await this.users.markVerified(transaction, consumed.userId, now);
      return true;
    });
    if (!verified) throw invalidLink();
  }

  private async createOrRefresh(
    address: string,
    key: string,
    passwordHash: string,
    mayMail: boolean,
  ): Promise<Issued | undefined> {
    const attempt = (): Promise<Issued | undefined> =>
      this.unitOfWork.run((transaction) =>
        this.createOrRefreshIn(transaction, address, key, passwordHash, mayMail),
      );
    try {
      return await attempt();
    } catch (error) {
      if (!isUniqueViolation(error, 'users_email_key')) throw error;
      // A concurrent sign-up of the same address committed first: this one is then the second
      // sign-up of an existing address, which is what the retry sees.
      return attempt();
    }
  }

  /**
   * `mayMail` is the resend limit's answer, taken by the caller for every address alike. A new
   * account is mailed regardless (its first link is not a repeat); an existing unverified one takes
   * the new password and a new link only when the limit allows; a verified one is never touched.
   */
  private async createOrRefreshIn(
    transaction: Executor,
    address: string,
    key: string,
    passwordHash: string,
    mayMail: boolean,
  ): Promise<Issued | undefined> {
    const existing = await this.users.findByEmailKeyForUpdate(transaction, key);
    if (existing === undefined) {
      const now = formatNow(this.clock);
      const id = randomUUID();
      await this.users.insert(transaction, {
        id,
        email: address,
        emailKey: key,
        passwordHash,
        now,
      });
      await this.revisions.create(transaction, id);
      await this.preferences.createDefault(transaction, id, now);
      return this.issueToken(transaction, id, address);
    }
    if (existing.email_verified_at !== null || !mayMail) return undefined;
    await this.users.setPasswordHash(transaction, existing.id, passwordHash, formatNow(this.clock));
    return this.issueToken(transaction, existing.id, existing.email);
  }

  /** A new verification token for the user, replacing any older one (the newest link wins). */
  private async issueToken(
    transaction: Executor,
    userId: string,
    address: string,
  ): Promise<Issued> {
    const nowInstant = this.clock.now();
    const token = newToken();
    await this.emailTokens.deleteForUser(transaction, userId, 'verify_email');
    await this.emailTokens.insert(transaction, {
      id: randomUUID(),
      userId,
      purpose: 'verify_email',
      tokenHash: hashEmailToken(token),
      expiresAt: formatInstantMillis(
        nowInstant.add({ seconds: VERIFY_EMAIL_TOKEN_LIFETIME_SECONDS }),
      ),
      now: formatInstantMillis(nowInstant),
    });
    return { address, token };
  }

  /** After the commit, off the request: a failed send is logged and the user can resend. */
  private sendVerificationMail({ address, token }: Issued): void {
    this.background.run('verification email', async () => {
      const result = await this.mail.sendVerifyEmail({ to: address, token });
      if (result.status === 'failed') {
        this.logger.warn(
          `Verification email was not delivered (${result.reason}); the user can ask for a new one.`,
        );
      }
    });
  }
}

/** The sign-up address rule is the mail address rule (T1.4 backlog): what cannot be mailed cannot register. */
function requireMailAddress(address: string): string {
  if (!isSafeMailAddress(address)) {
    throw invalidRequest([{ path: 'body.email', message: 'Enter a valid email address.' }]);
  }
  return address;
}

function invalidLink(): AppError {
  return new AppError('VALIDATION', INVALID_LINK_MESSAGE);
}
