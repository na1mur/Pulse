import { Injectable, Logger } from '@nestjs/common';
import { summarizeError } from '../logging/safe-error.js';
import { withTimeout } from './with-timeout.js';

/**
 * Work that must not delay an answer, because how long the answer takes would give something
 * away (sending the verification email only when the account exists would let response time
 * reveal it, spec 9.1). A task runs after `run` returns, its failure is logged by class and code
 * only (OPS-04), never thrown, and shutdown drains the tasks (`drain`) so a mail that was already
 * queued is not dropped. Tasks keep the log context of the request that started them.
 */
@Injectable()
export class BackgroundTasks {
  private readonly logger = new Logger(BackgroundTasks.name);
  private readonly running = new Set<Promise<void>>();

  /** Starts `task` and returns at once. `label` names it in the failure log. */
  run(label: string, task: () => Promise<void>): void {
    const promise = Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        this.logger.error(`Background task "${label}" failed: ${summarizeError(error)}`);
      })
      .finally(() => {
        this.running.delete(promise);
      });
    this.running.add(promise);
  }

  /** Resolves when every task started so far has finished (tests, shutdown). */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }

  /**
   * Shutdown: waits up to `timeoutMs` for the tasks, and logs (never throws) when some are still
   * running then. Called by the database shutdown once the HTTP server has drained, because only
   * then can no request start another task, and before the pool closes, because a task may query.
   */
  async drain(timeoutMs: number): Promise<void> {
    try {
      await withTimeout(this.idle(), timeoutMs, 'Background tasks');
    } catch (error) {
      this.logger.warn(summarizeError(error));
    }
  }
}
