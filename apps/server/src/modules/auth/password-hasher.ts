import { Injectable, type OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  PASSWORD_SALT_BYTES,
  hashPassword,
  verifyPassword,
} from '../../domain/auth/password-hash.js';
import { newToken } from './new-token.js';

/**
 * Password hashing for the auth services (Argon2id, spec 9.1). Besides the plain `hash` and
 * `verify` it answers the question sign-in must not answer differently for known and unknown
 * emails: `verify` with no stored hash does the same work against a throwaway hash made with the
 * same parameters at start-up, so the time spent does not tell whether the account exists (spec
 * 9.1: login errors identical including timing).
 */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  // Made once per instance, from a random password nobody knows, with the current parameters.
  private dummy: Promise<string> | undefined;

  /**
   * Makes the throwaway hash while the application starts: the first unknown-email sign-in then
   * costs one hash like every other, the hash is never left running unawaited when the
   * application closes, and a failure stops the start instead of surfacing later as an
   * unhandled rejection.
   */
  async onModuleInit(): Promise<void> {
    await this.dummyHash();
  }

  hash(password: string): Promise<string> {
    return hashPassword(password, randomBytes(PASSWORD_SALT_BYTES));
  }

  /** False for a wrong password, a malformed hash, and when there is no hash (`null`). */
  async verify(password: string, stored: string | null): Promise<boolean> {
    if (stored === null) {
      await verifyPassword(password, await this.dummyHash());
      return false;
    }
    return verifyPassword(password, stored);
  }

  private dummyHash(): Promise<string> {
    this.dummy ??= this.hash(newToken());
    return this.dummy;
  }
}
