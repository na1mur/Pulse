import { describe, expect, it } from 'vitest';
import { describeConnectionFailure } from './connection-failure.js';

const coded = (code: string): Error => Object.assign(new Error(''), { code });
const url = 'postgres://pulse:s3cret@db.internal:6543/pulse';

describe('describeConnectionFailure', () => {
  it('names host and port for a refused connection, never the credentials', () => {
    const error = describeConnectionFailure(coded('ECONNREFUSED'), url);
    expect(error?.message).toBe(
      'Cannot reach the database at db.internal:6543 (ECONNREFUSED). Is PostgreSQL running, and is DATABASE_URL right?',
    );
    expect(error?.message).not.toMatch(/s3cret|pulse:/);
  });

  it('finds the code inside the AggregateError node-postgres throws for localhost', () => {
    const aggregate = new AggregateError([coded('ECONNREFUSED'), coded('ECONNREFUSED')]);
    expect(describeConnectionFailure(aggregate, 'postgres://u:p@localhost/pulse')?.message).toMatch(
      /^Cannot reach the database at localhost:5432 \(ECONNREFUSED\)/,
    );
  });

  it.each(['ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'])('covers %s', (code) => {
    expect(describeConnectionFailure(coded(code), url)?.message).toContain(`(${code})`);
  });

  it('leaves other errors alone, they already say what is wrong', () => {
    expect(describeConnectionFailure(coded('28P01'), url)).toBeUndefined();
    expect(
      describeConnectionFailure(new Error('database "x" does not exist'), url),
    ).toBeUndefined();
    expect(describeConnectionFailure('boom', url)).toBeUndefined();
  });

  it('still answers when the URL does not parse', () => {
    expect(describeConnectionFailure(coded('ECONNREFUSED'), 'not a url')?.message).toContain(
      'the configured host',
    );
  });
});
