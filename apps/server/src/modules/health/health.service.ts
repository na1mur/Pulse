import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OperationResponse } from '@pulse/contract';
import { withTimeout } from '../../platform/async/with-timeout.js';
import type { AppConfig } from '../../platform/config/app-config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';
import { AppError } from '../../platform/errors/app-error.js';
import { HealthRepository } from './health.repository.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly repository: HealthRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * OPS-01: API and database status from a real query. When the database does not answer within
   * the health timeout the answer is 503 UNAVAILABLE (the contract's health.get), so a load
   * balancer or `docker compose` notices; the cause goes to the log, never to the caller.
   */
  async report(): Promise<OperationResponse<'health.get'>> {
    try {
      await withTimeout(
        this.repository.ping(),
        this.config.limits.healthTimeoutMs,
        'The health query',
      );
    } catch (error) {
      // Only the error class and code: a driver message can name the host and user.
      const code = (error as { code?: unknown } | null)?.code;
      this.logger.warn(
        `Database health check failed (${error instanceof Error ? error.name : 'error'}` +
          `${typeof code === 'string' ? `, ${code}` : ''})`,
      );
      throw new AppError('UNAVAILABLE', 'The database is unavailable.');
    }
    return { status: 'ok', database: 'up' };
  }
}
