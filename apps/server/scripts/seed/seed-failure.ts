// Error text for the seed command line. Node can raise errors with an empty message (an
// AggregateError when "localhost" resolves to both ::1 and 127.0.0.1 and both refuse), which
// would print as a bare "seed: ".

const REFUSED_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EADDRNOTAVAIL',
]);

const DEFAULT_PORT = '5432';

/** A readable reason for any thrown value; never empty. */
export function summarizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const message = error.message.trim();
  if (message !== '') {
    return message;
  }
  if (error instanceof AggregateError) {
    const inner = [...new Set(error.errors.map((item: unknown) => summarizeError(item)))];
    if (inner.length > 0) {
      return inner.join('; ');
    }
  }
  return errorCode(error) ?? error.name;
}

/**
 * What to tell the contributor when connecting to the dev database failed. Names host and port
 * from the URL, never its user or password. A refused connection (nothing listening yet) points
 * at `pnpm dev:up`; anything else keeps the server's own reason.
 */
export function describeConnectionFailure(error: unknown, databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const where = `${url.hostname}:${url.port === '' ? DEFAULT_PORT : url.port}`;

  const refused = collectCodes(error).find((code) => REFUSED_CODES.has(code));
  if (refused !== undefined) {
    return `could not connect to ${where} (${refused}); is the database running? Try \`pnpm dev:up\` first.`;
  }
  return `could not connect to ${where}: ${summarizeError(error)}`;
}

function collectCodes(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [];
  }
  const own = errorCode(error);
  const inner = error instanceof AggregateError ? error.errors.flatMap(collectCodes) : [];
  return own === undefined ? inner : [own, ...inner];
}

/** The Node or pg `code` of an error (ENOENT, ECONNREFUSED, ...), if it has a non-empty one. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code !== ''
    ? error.code
    : undefined;
}
