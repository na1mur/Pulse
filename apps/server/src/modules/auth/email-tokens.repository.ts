import { Injectable } from '@nestjs/common';
import type { EmailTokenPurpose } from '../../platform/database/database.types.js';
import type { Executor } from '../../platform/database/unit-of-work.js';

export interface NewEmailToken {
  readonly id: string;
  readonly userId: string;
  readonly purpose: EmailTokenPurpose;
  readonly tokenHash: Buffer;
  readonly expiresAt: string;
  readonly now: string;
}

/** SQL for `email_tokens`: only hashes are ever stored or compared. */
@Injectable()
export class EmailTokensRepository {
  async insert(executor: Executor, token: NewEmailToken): Promise<void> {
    await executor
      .insertInto('email_tokens')
      .values({
        id: token.id,
        user_id: token.userId,
        purpose: token.purpose,
        token_hash: token.tokenHash,
        expires_at: token.expiresAt,
        created_at: token.now,
      })
      .execute();
  }

  /** Drops a user's tokens of one purpose, so that at most the newest link works. */
  async deleteForUser(
    executor: Executor,
    userId: string,
    purpose: EmailTokenPurpose,
  ): Promise<void> {
    await executor
      .deleteFrom('email_tokens')
      .where('user_id', '=', userId)
      .where('purpose', '=', purpose)
      .execute();
  }

  /**
   * Uses the token, once: one statement that finds a token of this purpose that is unused and
   * not yet expired (valid up to, not including, its expiry instant) and marks it used. Of two
   * concurrent calls with the same token the second waits for the first's row lock, re-checks
   * `used_at is null`, and gets nothing. Returns the user it belongs to, or undefined for an
   * unknown, used, expired or other-purpose token (all alike to the caller).
   */
  async consume(
    executor: Executor,
    tokenHash: Buffer,
    purpose: EmailTokenPurpose,
    now: string,
  ): Promise<{ userId: string } | undefined> {
    const row = await executor
      .updateTable('email_tokens')
      .set({ used_at: now })
      .where('token_hash', '=', tokenHash)
      .where('purpose', '=', purpose)
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date(now))
      .returning('user_id')
      .executeTakeFirst();
    return row === undefined ? undefined : { userId: row.user_id };
  }
}
