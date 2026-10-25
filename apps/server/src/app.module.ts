import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppUpdatesModule } from './modules/app-updates/app-updates.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ClockModule } from './platform/clock/clock.module.js';
import { ContractExceptionFilter } from './platform/errors/contract-exception.filter.js';
import { ContractValidationPipe } from './platform/http/contract-validation.pipe.js';
import { RequestContextMiddleware } from './platform/http/request-context.middleware.js';

// Root module. Feature modules (one per spec 7.2 operation group) and platform/ are imported
// here as their tasks land; see docs/ARCHITECTURE.md section 3.
@Module({
  imports: [ClockModule, HealthModule, AppUpdatesModule],
  providers: [
    { provide: APP_PIPE, useClass: ContractValidationPipe },
    { provide: APP_FILTER, useClass: ContractExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every path, matched or not, so 404s carry server time and a request ID too.
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
