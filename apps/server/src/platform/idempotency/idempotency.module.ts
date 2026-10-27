import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service.js';

/** Provides the idempotency store (R-34) to every module that runs commands. */
@Global()
@Module({ providers: [IdempotencyService], exports: [IdempotencyService] })
export class IdempotencyModule {}
