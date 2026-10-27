import { Injectable } from '@nestjs/common';

/**
 * One deadline for the whole shutdown (spec 9.2): the HTTP drain and the database pool close
 * share it, so their waits cannot add up past the budget Docker allows before it kills the
 * process. The first step to run starts it.
 */
@Injectable()
export class ShutdownDeadline {
  private deadlineAt: number | undefined;

  start(totalMs: number): void {
    this.deadlineAt ??= performance.now() + totalMs;
  }

  /** Time left; `fallbackMs` when no shutdown has started (a module closed on its own). */
  remainingMs(fallbackMs: number): number {
    return this.deadlineAt === undefined
      ? fallbackMs
      : Math.max(0, this.deadlineAt - performance.now());
  }
}
