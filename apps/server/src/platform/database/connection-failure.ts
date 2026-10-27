// Network-level failures that mean "nothing is listening there". node-postgres reports a refused
// connection to "localhost" as an AggregateError (one error per resolved address, IPv4 and IPv6)
// with an empty message, which says nothing about where it tried.
const unreachableCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

function unreachableCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && unreachableCodes.has(code)) return code;
  if (error instanceof AggregateError) {
    for (const inner of error.errors as unknown[]) {
      const found = unreachableCode(inner);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * A short startup error naming the host and port (never the user or password) when the database
 * cannot be reached; undefined for any other error, which already says what is wrong (wrong
 * password, missing database, a failed migration).
 */
export function describeConnectionFailure(error: unknown, databaseUrl: string): Error | undefined {
  const code = unreachableCode(error);
  if (code === undefined) return undefined;
  let target = 'the configured host';
  try {
    const url = new URL(databaseUrl);
    target = `${url.hostname}:${url.port === '' ? '5432' : url.port}`;
  } catch {
    // The URL does not parse; the generic wording above is all we can say.
  }
  return new Error(
    `Cannot reach the database at ${target} (${code}). Is PostgreSQL running, and is DATABASE_URL right?`,
  );
}
