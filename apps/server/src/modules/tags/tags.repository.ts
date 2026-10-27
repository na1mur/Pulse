import { Injectable } from '@nestjs/common';
import type { DistractionClass } from '@pulse/contract';
import type { Selectable } from 'kysely';
import type { TagsTable } from '../../platform/database/database.types.js';
import type { Executor } from '../../platform/database/unit-of-work.js';

export type TagRow = Selectable<TagsTable>;

export interface NewTag {
  readonly id: string;
  readonly name: string;
  readonly nameKey: string;
  readonly category: TagsTable['category'];
  readonly distractionClass: (typeof DistractionClass.options)[number] | null;
}

/** SQL for `tags`; the tag use cases (T2.x, TAG-01..) grow here. */
@Injectable()
export class TagsRepository {
  /**
   * Inserts tags for a user, all at one revision. The unique index on (user, name key) among live
   * tags is the backstop: a tag created twice under a race fails here instead of existing twice.
   */
  async insertMany(
    executor: Executor,
    userId: string,
    tags: readonly NewTag[],
    change: { revision: number; now: string },
  ): Promise<TagRow[]> {
    if (tags.length === 0) return [];
    const rows = await executor
      .insertInto('tags')
      .values(
        tags.map((tag) => ({
          id: tag.id,
          user_id: userId,
          name: tag.name,
          name_key: tag.nameKey,
          category: tag.category,
          distraction_class: tag.distractionClass,
          revision: change.revision,
          created_at: change.now,
          updated_at: change.now,
        })),
      )
      .returningAll()
      .execute();
    // RETURNING does not promise the order of VALUES; the caller's order is the tag order.
    const byId = new Map(rows.map((row) => [row.id, row]));
    return tags.flatMap((tag) => byId.get(tag.id) ?? []);
  }

  /** The user's tags that are not deleted, oldest first (archived ones included). */
  listLive(executor: Executor, userId: string): Promise<TagRow[]> {
    return executor
      .selectFrom('tags')
      .selectAll()
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
  }
}
