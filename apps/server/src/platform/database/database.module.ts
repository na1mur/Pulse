import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { createDatabase, createUnconfiguredDatabase } from './database.factory.js';
import type { Database } from './database.types.js';

/** Nest injection token for the application's `Kysely<Database>`. */
export const DATABASE = Symbol('Database');

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}

/**
 * Provides the Kysely instance to repositories (global, like the clock). Reads DATABASE_URL
 * directly until T1.2 adds validated configuration. Without it the instance fails on first use:
 * that keeps HTTP specs that need no database bootable, while `startServer` refuses to start the
 * real server without the URL. Migrations are run by `startServer`, not here.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Kysely<Database> => {
        const url = process.env['DATABASE_URL'];
        return url === undefined || url === '' ? createUnconfiguredDatabase() : createDatabase(url);
      },
    },
    DatabaseShutdown,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
