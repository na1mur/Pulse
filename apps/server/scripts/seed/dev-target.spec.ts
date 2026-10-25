import { describe, expect, it } from 'vitest';
import { SeedRefusedError, assertDevTarget } from './dev-target.ts';

const refused = (databaseUrl: string, nodeEnv?: string): SeedRefusedError => {
  try {
    assertDevTarget({ databaseUrl, ...(nodeEnv === undefined ? {} : { nodeEnv }) });
  } catch (error) {
    if (error instanceof SeedRefusedError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the target to be refused');
};

describe('assertDevTarget (the seed runner never touches a non-dev database)', () => {
  it.each([
    'postgres://pulse:pulse@localhost:5432/pulse',
    'postgresql://pulse:pulse@LOCALHOST/pulse',
    'postgres://pulse:pulse@127.0.0.1:5432/pulse',
    'postgres://pulse:pulse@[::1]:5432/pulse',
  ])('accepts the loopback host in %s', (url) => {
    expect(() => {
      assertDevTarget({ databaseUrl: url });
    }).not.toThrow();
  });

  it.each([undefined, '', 'development', 'test'])('accepts NODE_ENV=%j', (nodeEnv) => {
    expect(() => {
      assertDevTarget({
        databaseUrl: 'postgres://pulse:pulse@localhost/pulse',
        ...(nodeEnv === undefined ? {} : { nodeEnv }),
      });
    }).not.toThrow();
  });

  it.each(['production', 'Production', ' PRODUCTION '])('refuses NODE_ENV=%j', (nodeEnv) => {
    expect(refused('postgres://pulse:pulse@localhost/pulse', nodeEnv).message).toMatch(
      /NODE_ENV=production/,
    );
  });

  it.each([
    'postgres://pulse:pulse@db:5432/pulse',
    'postgres://pulse:pulse@db.example.com/pulse',
    'postgres://pulse:pulse@10.0.0.5/pulse',
    'postgres://pulse:pulse@localhost.example.com/pulse',
    'postgres://pulse:pulse@127.0.0.1.example.com/pulse',
    'postgres://pulse:pulse@0.0.0.0/pulse',
    'postgres://pulse:pulse@localhost,db.example.com/pulse',
  ])('refuses the non-local host in %s', (url) => {
    expect(refused(url).message).toMatch(/not a local/);
  });

  it.each([
    'postgres://pulse:pulse@localhost/pulse?host=db.example.com',
    'postgres://pulse:pulse@localhost/pulse?hostaddr=10.0.0.5',
    'postgres://pulse@/pulse?host=/var/run/postgresql',
    'postgres:///pulse',
  ])('refuses a URL that can point elsewhere: %s', (url) => {
    expect(refused(url)).toBeInstanceOf(SeedRefusedError);
  });

  it('refuses a value that is not a URL without echoing it (it may hold a password)', () => {
    const error = refused('not a url with secret-password');
    expect(error.message).not.toContain('secret-password');
  });

  it('never prints the password of a refused URL', () => {
    const error = refused('postgres://admin:hunter2@db.example.com/prod');
    expect(error.message).not.toContain('hunter2');
    expect(error.message).toContain('db.example.com');
  });
});
