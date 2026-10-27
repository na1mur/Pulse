import { Global, Module } from '@nestjs/common';
import { BackgroundTasks } from './background-tasks.js';

/** Provides `BackgroundTasks` everywhere; the database shutdown drains it (spec 9.2). */
@Global()
@Module({ providers: [BackgroundTasks], exports: [BackgroundTasks] })
export class BackgroundTasksModule {}
