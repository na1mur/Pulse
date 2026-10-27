const PLAIN_NAME = /^[A-Za-z][A-Za-z0-9_$.]{0,63}$/;
// PostgreSQL SQLSTATE values (22P02) and Node error codes (ECONNREFUSED).
const PLAIN_CODE = /^[A-Z0-9_]{1,40}$/;

/**
 * What a log may say about an error (OPS-04): its class name and, when it has one, its code.
 * Never the message: driver and validation errors embed user values in it. A thrown value that
 * is not an Error is described by its type only.
 */
export function summarizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return `a thrown ${error === null ? 'null' : typeof error}`;
  }
  const name = PLAIN_NAME.test(error.name) ? error.name : 'Error';
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && PLAIN_CODE.test(code) ? `${name} [${code}]` : name;
}

/** The "at ..." lines of a stack, without the message lines that precede them. */
export function stackFrames(stack: string | undefined): string {
  return (stack ?? '')
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n');
}
