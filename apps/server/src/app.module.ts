import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppUpdatesModule } from './modules/app-updates/app-updates.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { BackgroundTasksModule } from './platform/async/background-tasks.module.js';
import { ClockModule } from './platform/clock/clock.module.js';
import { ConfigModule } from './platform/config/config.module.js';
import { LifecycleModule } from './platform/lifecycle/lifecycle.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { UnitOfWorkModule } from './platform/database/unit-of-work.module.js';
import { ContractExceptionFilter } from './platform/errors/contract-exception.filter.js';
import { ContractValidationPipe } from './platform/http/contract-validation.pipe.js';
import { GracefulShutdown } from './platform/http/graceful-shutdown.js';
import { RequestTimeoutInterceptor } from './platform/http/request-timeout.interceptor.js';
import { IdempotencyModule } from './platform/idempotency/idempotency.module.js';
import { RateLimitModule } from './platform/rate-limit/rate-limit.module.js';
import { RevisionModule } from './platform/revisions/revision.module.js';

// Root module. Feature modules (one per spec 7.2 operation group) and platform/ are imported
// here as their tasks land; see docs/ARCHITECTURE.md section 3. The request context, CORS and
// proxy settings are applied to the HTTP application by `configureApp`, not by a module.
@Module({
  imports: [
    ConfigModule,
    LifecycleModule,
    ClockModule,
    DatabaseModule,
    UnitOfWorkModule,
    RevisionModule,
    IdempotencyModule,
    RateLimitModule,
    BackgroundTasksModule,
    HealthModule,
    AppUpdatesModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ContractValidationPipe },
    { provide: APP_FILTER, useClass: ContractExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestTimeoutInterceptor },
    GracefulShutdown,
  ],
})
export class AppModule {}
