import { Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import type { UsersTable } from '../../platform/database/database.types.js';
import type { Executor } from '../../platform/database/unit-of-work.js';

export type UserRow = Selectable<UsersTable>;

export interface NewUser {
  readonly id: string;
  readonly email: string;
  /** `emailKey(email)`: every insert and lookup goes through it. */
  readonly emailKey: string;
  readonly passwordHash: string;
  readonly now: string;
}

/** SQL for `users`. No rules here: the services decide, this runs. */
@Injectable()
export class UsersRepository {
  findByEmailKey(executor: Executor, emailKey: string): Promise<UserRow | undefined> {
    return executor
      .selectFrom('users')
      .selectAll()
      .where('email_key', '=', emailKey)
      .executeTakeFirst();
  }

  /** Locks the row until the transaction ends, so concurrent registrations of one address queue. */
  findByEmailKeyForUpdate(executor: Executor, emailKey: string): Promise<UserRow | undefined> {
    return executor
      .selectFrom('users')
      .selectAll()
      .where('email_key', '=', emailKey)
      .forUpdate()
      .executeTakeFirst();
  }

  findById(executor: Executor, id: string): Promise<UserRow | undefined> {
    return executor.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async insert(executor: Executor, user: NewUser): Promise<void> {
    await executor
      .insertInto('users')
      .values({
        id: user.id,
        email: user.email,
        email_key: user.emailKey,
        password_hash: user.passwordHash,
        created_at: user.now,
        updated_at: user.now,
      })
      .execute();
  }

  async setPasswordHash(
    executor: Executor,
    id: string,
    passwordHash: string,
    now: string,
  ): Promise<void> {
    await executor
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: now })
      .where('id', '=', id)
      .execute();
  }

  /** Sets the verification instant once; a second verification keeps the first. */
  async markVerified(executor: Executor, id: string, now: string): Promise<void> {
    await executor
      .updateTable('users')
      .set((eb) => ({
        email_verified_at: eb.fn.coalesce('email_verified_at', eb.val(now)),
        updated_at: now,
      }))
      .where('id', '=', id)
      .execute();
  }
}
