import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The only identifiers a log line may carry besides its own message (OPS-04, spec 9.1): the ID of
 * the request and, once authentication knows it, the ID of the user.
 */
export interface LogContext {
  readonly requestId: string;
  userId?: string;
}

// Deliberate store: it follows one request through every async step without passing it around.
const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<Result>(context: LogContext, work: () => Result): Result {
  return storage.run(context, work);
}

export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}

/** Called by authentication once the request's user is known; later log lines carry the ID. */
export function setLogUser(userId: string): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}
