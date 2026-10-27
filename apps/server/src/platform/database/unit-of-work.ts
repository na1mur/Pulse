import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.module.js';
import type { Database } from './database.types.js';

/**
 * What a repository method runs its SQL on: the pool (a single statement) or a transaction (a
 * Kysely `Transaction` is a `Kysely`). Services pass the one they mean; a repository never
 * opens a transaction itself.
 */
export type Executor = Kysely<Database>;

/**
 * The transaction boundary of a use case (ARCHITECTURE 3: services own it). `run` commits when
 * the work resolves and rolls back when it throws, so everything a write changes, including the
 * revision bump and derived data (R-35, R-54), lands together or not at all.
 */
@Injectable()
export class UnitOfWork {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  /** For reads and single statements outside a transaction. */
  get pool(): Executor {
    return this.db;
  }

  run<Result>(work: (transaction: Executor) => Promise<Result>): Promise<Result> {
    return this.db.transaction().execute(work);
  }
}
