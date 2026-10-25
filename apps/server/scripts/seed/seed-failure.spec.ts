import { describe, expect, it } from 'vitest';
import { describeConnectionFailure, summarizeError } from './seed-failure.ts';

const withCode = (message: string, code: string): Error =>
  Object.assign(new Error(message), { code });

// What Node raises when "localhost" resolves to ::1 and 127.0.0.1 and both refuse: an
// AggregateError whose own message is empty.
const refusedEverywhere = (port: number): AggregateError =>
  new AggregateError(
    [
      withCode(`connect ECONNREFUSED ::1:${port}`, 'ECONNREFUSED'),
      withCode(`connect ECONNREFUSED 127.0.0.1:${port}`, 'ECONNREFUSED'),
    ],
    '',
  );

describe('describeConnectionFailure', () => {
  const url = 'postgres://pulse:s3cret@localhost:59999/pulse';

  it('explains an AggregateError with an empty message, naming host, port and the code', () => {
    const text = describeConnectionFailure(refusedEverywhere(59999), url);

    expect(text).toBe(
      'could not connect to localhost:59999 (ECONNREFUSED); is the database running? Try `pnpm dev:up` first.',
    );
  });

  it('explains a single refused connection the same way', () => {
    const error = withCode('connect ECONNREFUSED 127.0.0.1:59999', 'ECONNREFUSED');

    expect(describeConnectionFailure(error, url)).toMatch(
      /^could not connect to localhost:59999 \(ECONNREFUSED\); is the database running\?/,
    );
  });

  it('uses the default port when the URL has none', () => {
    const text = describeConnectionFailure(
      refusedEverywhere(5432),
      'postgres://pulse:s3cret@127.0.0.1/pulse',
    );

    expect(text).toContain('127.0.0.1:5432');
  });

  it('never contains the password or the user', () => {
    const text = describeConnectionFailure(refusedEverywhere(59999), url);

    expect(text).not.toContain('s3cret');
    expect(text).not.toContain('pulse:');
  });

  it('keeps the server message for a failure that is not a refused connection', () => {
    const error = new Error('password authentication failed for user "pulse"');

    expect(describeConnectionFailure(error, url)).toBe(
      'could not connect to localhost:59999: password authentication failed for user "pulse"',
    );
  });

  it('falls back to the inner messages when an AggregateError has no refusal code', () => {
    const error = new AggregateError([new Error('first'), new Error('second')], '');

    expect(describeConnectionFailure(error, url)).toBe(
      'could not connect to localhost:59999: first; second',
    );
  });
});

describe('summarizeError', () => {
  it('returns the message of a normal error', () => {
    expect(summarizeError(new Error('boom'))).toBe('boom');
  });

  it('joins the inner messages of an AggregateError with an empty message', () => {
    const error = new AggregateError([new Error('a'), new Error('b')], '');

    expect(summarizeError(error)).toBe('a; b');
  });

  it('falls back to the error code, then the error name, when there is no message', () => {
    expect(summarizeError(withCode('', 'EACCES'))).toBe('EACCES');
    expect(summarizeError(new TypeError(''))).toBe('TypeError');
  });

  it('stringifies a thrown value that is not an error', () => {
    expect(summarizeError('plain text')).toBe('plain text');
  });
});
