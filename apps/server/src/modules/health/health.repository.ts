import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from '../../platform/database/database.module.js';
import type { Database } from '../../platform/database/database.types.js';

@Injectable()
export class HealthRepository {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  /** A round trip to PostgreSQL; rejects when the database cannot answer. */
  async ping(): Promise<void> {
    await sql`select 1`.execute(this.db);
  }
}
