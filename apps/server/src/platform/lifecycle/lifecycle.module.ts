import { Global, Module } from '@nestjs/common';
import { ShutdownDeadline } from './shutdown-deadline.js';

/** Provides the shared shutdown deadline to the HTTP and database shutdown steps. */
@Global()
@Module({ providers: [ShutdownDeadline], exports: [ShutdownDeadline] })
export class LifecycleModule {}
