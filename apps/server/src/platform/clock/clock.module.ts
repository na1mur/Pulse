import { Global, Module } from '@nestjs/common';
import { CLOCK } from './clock.js';
import { SystemClock } from './system-clock.js';

/** Provides the Clock everywhere (ADR-0004); global because nearly every module needs "now". */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
