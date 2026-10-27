export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
}

/**
 * Settles with `work`, or rejects with a TimeoutError after `timeoutMs`. The work itself is not
 * cancelled: give the underlying call its own bound (statement timeout) so it cannot run forever.
 */
export async function withTimeout<Value>(
  work: Promise<Value>,
  timeoutMs: number,
  what: string,
): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`${what} did not finish within ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}
