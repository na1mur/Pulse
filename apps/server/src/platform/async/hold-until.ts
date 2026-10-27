/**
 * Waits until `floorMs` have passed since `startedAt` (a `performance.now()` reading), or returns
 * at once when they already have. Used where the time an answer takes would reveal something
 * (does this address have an account?): every path that can be told apart by its work is held to
 * the same minimum, which must exceed the slowest path's work, or the floor hides nothing.
 */
export async function holdUntil(startedAt: number, floorMs: number): Promise<void> {
  const remaining = floorMs - (performance.now() - startedAt);
  if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
}
