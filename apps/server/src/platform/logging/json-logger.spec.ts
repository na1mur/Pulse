// OPS-04: structured logs with request IDs and user IDs only.
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonLogger, type LogLevel } from './json-logger.js';
import { runWithLogContext, setLogUser } from './log-context.js';

function capture(minimumLevel?: LogLevel) {
  const lines: { level: LogLevel; entry: Record<string, unknown>; raw: string }[] = [];
  const logger = new JsonLogger(
    (level, raw) => lines.push({ level, entry: JSON.parse(raw) as Record<string, unknown>, raw }),
    minimumLevel,
  );
  return { logger, lines };
}

describe('JsonLogger (OPS-04)', () => {
  afterEach(() => {
    Logger.overrideLogger(['log', 'warn', 'error']);
  });

  it('writes one JSON object per call with time, level, context and message', () => {
    const { logger, lines } = capture();
    logger.log('Applied database migrations: 0001', 'Migrations');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.entry).toMatchObject({
      level: 'log',
      context: 'Migrations',
      message: 'Applied database migrations: 0001',
    });
    expect(lines[0]?.entry['time']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(lines[0]?.entry).not.toHaveProperty('requestId');
    expect(lines[0]?.entry).not.toHaveProperty('userId');
  });

  it('adds the request ID and, once known, the user ID from the log context', () => {
    const { logger, lines } = capture();
    runWithLogContext({ requestId: 'req-1' }, () => {
      logger.log('before sign-in');
      setLogUser('user-7');
      logger.log('after sign-in');
    });
    expect(lines.map((line) => line.entry['userId'])).toEqual([undefined, 'user-7']);
    expect(lines.map((line) => line.entry['requestId'])).toEqual(['req-1', 'req-1']);
  });

  it('keeps the context across awaits and apart between concurrent requests', async () => {
    const { logger, lines } = capture();
    const request = (id: string, delayMs: number) =>
      runWithLogContext({ requestId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        logger.log('done');
      });
    await Promise.all([request('slow', 20), request('fast', 1)]);
    expect(lines.map((line) => line.entry['requestId'])).toEqual(['fast', 'slow']);
  });

  it('puts only the frames of an error call in the stack field, not its message lines (OPS-04)', () => {
    const { logger, lines } = capture();
    logger.error(
      'Unhandled error',
      'Error: invalid input for "a.person@example.org"\n    at x (y.ts:1:1)',
      'ContractExceptionFilter',
    );
    expect(lines[0]).toMatchObject({
      level: 'error',
      entry: {
        message: 'Unhandled error',
        context: 'ContractExceptionFilter',
        stack: '    at x (y.ts:1:1)',
      },
    });
    expect(lines[0]?.raw).not.toContain('example.org');
  });

  it('logs an Error by class and code, never its message text (OPS-04)', () => {
    const { logger, lines } = capture();
    const error = Object.assign(new TypeError('bad value "a.person@example.org"'), {
      code: '22P02',
    });
    logger.error(error, 'Somewhere');
    logger.warn(error);
    expect(lines.map((line) => line.entry['message'])).toEqual([
      'TypeError [22P02]',
      'TypeError [22P02]',
    ]);
    expect(lines.map((line) => line.raw).join('\n')).not.toContain('example.org');
    expect(lines[0]?.entry['stack']).toContain('at ');
  });

  it('keeps a line break in a message from starting a second line (log injection)', () => {
    const { logger, lines } = capture();
    logger.log('first\n{"level":"error","message":"forged"}');
    expect(lines[0]?.raw).not.toContain('\n');
    expect(lines[0]?.entry['level']).toBe('log');
  });

  it('takes plain fields of a structured call and drops everything else', () => {
    const { logger, lines } = capture();
    logger.log(
      {
        message: 'request',
        status: 200,
        method: 'GET',
        nested: { email: 'a@b.c' },
        email: 'a.person@example.org',
        title: 'my private session title',
        level: 'forged',
        requestId: 'forged',
      },
      'Http',
    );
    const entry = lines[0]?.entry;
    expect(entry).toMatchObject({ message: 'request', status: 200, method: 'GET', level: 'log' });
    expect(entry).not.toHaveProperty('nested');
    expect(entry).not.toHaveProperty('requestId');
    expect(lines[0]?.raw).not.toContain('a@b.c');
    // Only the access-line fields are accepted, whatever other string a caller passes (OPS-04).
    expect(entry).not.toHaveProperty('email');
    expect(entry).not.toHaveProperty('title');
    expect(lines[0]?.raw).not.toContain('example.org');
  });

  it('skips levels below the minimum', () => {
    const { logger, lines } = capture('warn');
    logger.debug('d');
    logger.log('l');
    logger.warn('w');
    logger.error('e');
    expect(lines.map((line) => line.level)).toEqual(['warn', 'error']);
  });

  it('keeps the framework wiring chatter at debug level', () => {
    const quiet = capture();
    quiet.logger.log('Mapped {/health, GET} route', 'RouterExplorer');
    quiet.logger.log('Pulse server listening on port 3000', 'Bootstrap');
    expect(quiet.lines.map((line) => line.entry['context'])).toEqual(['Bootstrap']);
    const verbose = capture('debug');
    verbose.logger.log('Mapped {/health, GET} route', 'RouterExplorer');
    expect(verbose.lines).toHaveLength(1);
  });

  it('receives the calls of Nest loggers once it is installed', () => {
    const { logger, lines } = capture();
    Logger.overrideLogger(logger);
    new Logger('Somewhere').warn('careful');
    expect(lines[0]?.entry).toMatchObject({
      level: 'warn',
      context: 'Somewhere',
      message: 'careful',
    });
  });
});
