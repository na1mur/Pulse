import { Injectable } from '@nestjs/common';
import type { Executor } from '../database/unit-of-work.js';

/**
 * R-34: every write is a command with a client-generated ID, and a replay returns the original
 * result. The store is the `processed_commands` table, keyed (user, command ID), so one user's ID
 * can never match another's, and written in the same transaction as the work: either the change
 * and its stored result both commit or neither does. Only commands go through here (D-30:
 * credential operations are not commands), so what is stored is a result body that contains no
 * token or password.
 *
 * Concurrent copies of one command are serialised by the primary key: the second insert waits for
 * the first transaction to finish, then finds the row and returns its result; if the first rolled
 * back the second proceeds and does the work. Retention (30 days, Appendix A) is the purge job's
 * business, not this class's.
 */
@Injectable()
export class IdempotencyService {
  /**
   * Runs `work` unless this user already ran `commandId`, in which case the stored result comes
   * back and `work` does not run. Call with the transaction the work writes in; a rejection
   * (rolling the transaction back) stores nothing, so a rejected command can be sent again.
   */
  async run<Result>(
    transaction: Executor,
    userId: string,
    commandId: string,
    work: () => Promise<Result>,
  ): Promise<Result> {
    const claimed = await transaction
      .insertInto('processed_commands')
      // A placeholder: replaced below in the same transaction, never visible to another one.
      .values({ user_id: userId, command_id: commandId, result: 'null' })
      .onConflict((conflict) => conflict.columns(['user_id', 'command_id']).doNothing())
      .returning('command_id')
      .executeTakeFirst();

    if (claimed === undefined) {
      const stored = await transaction
        .selectFrom('processed_commands')
        .select('result')
        .where('user_id', '=', userId)
        .where('command_id', '=', commandId)
        .executeTakeFirstOrThrow();
      // Written by the branch below as JSON of a `Result`, so it reads back as one.
      return stored.result as Result;
    }

    const result = await work();
    await transaction
      .updateTable('processed_commands')
      .set({ result: JSON.stringify(result) })
      .where('user_id', '=', userId)
      .where('command_id', '=', commandId)
      .execute();
    return result;
  }
}
