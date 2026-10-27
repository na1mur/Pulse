import { Global, Module } from '@nestjs/common';
import { UnitOfWork } from './unit-of-work.js';

/** Provides the `UnitOfWork` everywhere, next to the global database it wraps. */
@Global()
@Module({ providers: [UnitOfWork], exports: [UnitOfWork] })
export class UnitOfWorkModule {}
