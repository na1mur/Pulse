import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.js';

/** Provides the one `RateLimiter` (and so one set of counters) to every module. */
@Global()
@Module({ providers: [RateLimiter], exports: [RateLimiter] })
export class RateLimitModule {}
