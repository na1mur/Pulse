import { Injectable } from '@nestjs/common';
import type { Executor } from '../database/unit-of-work.js';

/**
 * R-35: the per-user revision counter, the one owner of the `user_revisions` table. A user's row
 * is created with the user (revision 0, no change yet) and bumped inside the transaction of every
 * change, so the number a client sees is exactly the number of committed changes. The database
 * trigger refuses a decrease. Every write use case calls `bump` with its own transaction and
 * stores the returned revision on the rows it changed and in its result.
 */
@Injectable()
export class RevisionService {
  /** Creates the counter for a new user; call it in the transaction that inserts the user. */
  async create(transaction: Executor, userId: string): Promise<void> {
    await transaction.insertInto('user_revisions').values({ user_id: userId }).execute();
  }

  /**
   * Adds one and returns the new revision. The row lock this takes serialises concurrent changes
   * of one user until the surrounding transaction ends, which is also what makes revisions
   * strictly ordered by commit.
   */
  async bump(transaction: Executor, userId: string): Promise<number> {
    const row = await transaction
      .updateTable('user_revisions')
      .set((eb) => ({ revision: eb('revision', '+', 1) }))
      .where('user_id', '=', userId)
      .returning('revision')
      .executeTakeFirstOrThrow();
    return row.revision;
  }

  /** The current revision (for a read that must report it, such as a snapshot). */
  async current(executor: Executor, userId: string): Promise<number> {
    const row = await executor
      .selectFrom('user_revisions')
      .select('revision')
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow();
    return row.revision;
  }
}
