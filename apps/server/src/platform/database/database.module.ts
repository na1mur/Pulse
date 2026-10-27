import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Kysely } from 'kysely';
import { BackgroundTasks } from '../async/background-tasks.js';
import { withTimeout } from '../async/with-timeout.js';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { ShutdownDeadline } from '../lifecycle/shutdown-deadline.js';
import { createDatabase } from './database.factory.js';
import type { Database } from './database.types.js';

/** Nest injection token for the application's `Kysely<Database>`. */
export const DATABASE = Symbol('Database');

/**
 * Closes the pool last: after the HTTP server has drained and after the background work, which may
 * still query (a request that finished during the drain can have queued some), waiting only for
 * what is left of the shutdown deadline. The two waits are sequenced here, in one hook, because
 * Nest gives no order between the `onApplicationShutdown` hooks of different modules.
 */
@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  private readonly logger = new Logger('Database');

  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly deadline: ShutdownDeadline,
    private readonly background: BackgroundTasks,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    // Whatever is left of the one shutdown deadline, after the HTTP drain used its part.
    const remainingMs = (): number => this.deadline.remainingMs(this.config.limits.shutdownGraceMs);
    await this.background.drain(remainingMs());
    try {
      await withTimeout(this.db.destroy(), remainingMs(), 'Closing the pool');
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Closing the pool failed');
    }
  }
}

/**
 * Provides the Kysely instance to repositories (global, like the clock), connected to the
 * configured `DATABASE_URL` with the configured connection and statement timeouts. The pool
 * connects on first use, so a module that never queries boots without a database. Migrations are
 * run by `startServer`, not here.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: ({ databaseUrl, limits }: AppConfig): Kysely<Database> =>
        createDatabase(databaseUrl, {
          connectTimeoutMs: limits.databaseConnectTimeoutMs,
          statementTimeoutMs: limits.databaseStatementTimeoutMs,
          poolMax: limits.databasePoolMax,
        }),
    },
    DatabaseShutdown,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
