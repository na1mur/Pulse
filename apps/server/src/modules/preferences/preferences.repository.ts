import { Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import type { UserPreferencesTable } from '../../platform/database/database.types.js';
import type { Executor } from '../../platform/database/unit-of-work.js';

export type PreferencesRow = Selectable<UserPreferencesTable>;

/** SQL for `user_preferences` (one row per user, created with the account). */
@Injectable()
export class PreferencesRepository {
  /** The defaults of Appendix A and D-32; the timezone stays empty until confirmed (R-15). */
  async createDefault(executor: Executor, userId: string, now: string): Promise<void> {
    await executor
      .insertInto('user_preferences')
      .values({ user_id: userId, updated_at: now })
      .execute();
  }

  /** Locks the row until the transaction ends: first sign-in is decided on what it holds. */
  findForUpdate(executor: Executor, userId: string): Promise<PreferencesRow | undefined> {
    return executor
      .selectFrom('user_preferences')
      .selectAll()
      .where('user_id', '=', userId)
      .forUpdate()
      .executeTakeFirst();
  }

  /** R-15, AUTH-12: the confirmed timezone and the instant onboarding finished. */
  confirmTimezone(
    executor: Executor,
    userId: string,
    change: { timezone: string; completedAt: string; revision: number },
  ): Promise<PreferencesRow> {
    return executor
      .updateTable('user_preferences')
      .set({
        timezone: change.timezone,
        onboarding_completed_at: change.completedAt,
        revision: change.revision,
        updated_at: change.completedAt,
      })
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
