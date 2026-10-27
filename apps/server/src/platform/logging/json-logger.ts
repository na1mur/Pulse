import type { LoggerService } from '@nestjs/common';
import { currentLogContext } from './log-context.js';
import { stackFrames, summarizeError } from './safe-error.js';

export type LogLevel = 'verbose' | 'debug' | 'log' | 'warn' | 'error' | 'fatal';

const RANK: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};
// Nest's own wiring chatter (one line per module and route at start-up) is debug noise here.
const FRAMEWORK_CONTEXTS = new Set([
  'NestFactory',
  'NestApplication',
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
]);
// The only extra fields a structured call may add: those of the access line. An allow-list, so a
// caller that passes a string field with a title or an email cannot get it into the log (OPS-04).
const STRUCTURED_FIELDS = new Set(['method', 'route', 'status', 'durationMs']);

/** Receives one finished JSON line (without the line break). */
export type LogSink = (level: LogLevel, line: string) => void;

function writeToProcess(level: LogLevel, line: string): void {
  // Errors on stderr, the rest on stdout; both end up in `docker compose logs`.
  (RANK[level] >= RANK.error ? process.stderr : process.stdout).write(`${line}\n`);
}

function messageText(message: unknown): string {
  if (typeof message === 'string') return message;
  // An error's message text can embed user values: class and code only (OPS-04).
  if (message instanceof Error) return summarizeError(message);
  if (typeof message === 'object' && message !== null && 'message' in message) {
    return messageText(message.message);
  }
  if (typeof message === 'number' || typeof message === 'boolean') return String(message);
  return `a logged ${message === null ? 'null' : typeof message}`;
}

/** The allow-listed plain fields of a structured log call. */
function extraFields(message: unknown): Record<string, string | number | boolean> {
  if (typeof message !== 'object' || message === null || message instanceof Error) return {};
  const fields: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(message)) {
    const plain = ['string', 'number', 'boolean'].includes(typeof value);
    if (plain && STRUCTURED_FIELDS.has(key)) fields[key] = value as string | number | boolean;
  }
  return fields;
}

/**
 * Structured logging (OPS-04): one JSON object per line with time, level, context, message and,
 * inside a request, `requestId` and `userId` from the log context. Nothing else is added
 * automatically: no headers, no bodies, no tokens. An Error is logged by class and code, and its
 * stack by frames only; a structured call (`logger.log({ message: 'request', status: 200 })`)
 * keeps only the access-line fields. Callers still never put personal data in a message.
 */
export class JsonLogger implements LoggerService {
  constructor(
    private readonly sink: LogSink = writeToProcess,
    private readonly minimumLevel: LogLevel = 'log',
  ) {}

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('verbose', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }
  log(message: unknown, ...params: unknown[]): void {
    this.write('log', message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }
  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(level: LogLevel, message: unknown, params: readonly unknown[]): void {
    // Nest appends the logger's context name last; an error call may carry a stack before it.
    const last = params.at(-1);
    const context = typeof last === 'string' ? last : undefined;
    const effectiveLevel =
      level === 'log' && context !== undefined && FRAMEWORK_CONTEXTS.has(context) ? 'debug' : level;
    if (RANK[effectiveLevel] < RANK[this.minimumLevel]) return;
    const stackParam = RANK[level] >= RANK.error && params.length >= 2 ? params[0] : undefined;
    // Only the frames: the message lines of a stack can hold user values (OPS-04).
    const rawStack =
      typeof stackParam === 'string'
        ? stackParam
        : message instanceof Error
          ? message.stack
          : undefined;
    const stack = stackFrames(rawStack) || undefined;
    const requestContext = currentLogContext();
    const entry = {
      time: new Date().toISOString(),
      level: effectiveLevel,
      context,
      message: messageText(message),
      requestId: requestContext?.requestId,
      userId: requestContext?.userId,
      ...extraFields(message),
      stack,
    };
    this.sink(effectiveLevel, JSON.stringify(entry));
  }
}
