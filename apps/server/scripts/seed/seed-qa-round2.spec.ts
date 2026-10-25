// QA round 2 for T0.6: the connection-failure message of the real entry point (Bug 1), the error
// summary on odd inputs, and a failing rollback never hiding the seed's own error (Bug 7).
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSeedDatabase, type QueryClient } from './pg-database.ts';
import { describeConnectionFailure, summarizeError } from './seed-failure.ts';
import { SeedApplyError, runSeeds, type SeedFile } from './seed-runner.ts';

const serverDir = fileURLToPath(new URL('../../', import.meta.url));

/** A loopback port that was free a moment ago and has no listener now. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const runMain = (databaseUrl: string) => {
  const inherited = Object.entries(process.env).filter(([name]) => name !== 'NODE_ENV');
  const env = { ...Object.fromEntries(inherited), DATABASE_URL: databaseUrl };
  return spawnSync(process.execPath, ['scripts/seed/main.ts'], {
    cwd: serverDir,
    encoding: 'utf8',
    env,
  });
};

describe('main.ts when the database cannot be reached (Bug 1)', () => {
  it.each(['127.0.0.1', 'localhost', '[::1]'])(
    'names host and port and points at dev:up for a refused port on %s, with no user or password',
    async (host) => {
      const port = await closedPort();
      const result = runMain(`postgres://QaUser:QaSecretPw@${host}:${String(port)}/QaDb`);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(
        new RegExp(
          `^seed: could not connect to \\[?[^\\s]+:${String(port)} \\(E[A-Z]+\\); is the database running\\? Try \`pnpm dev:up\` first\\.\\n$`,
        ),
      );
      for (const secret of ['QaUser', 'QaSecretPw', 'QaDb']) {
        expect(result.stderr).not.toContain(secret);
      }
    },
  );

  it('never prints a bare "seed: " whatever the refused port', async () => {
    const result = runMain(`postgres://pulse:pulse@localhost:${String(await closedPort())}/pulse`);
    expect(result.stderr.trim()).not.toBe('seed:');
    expect(result.stderr.length).toBeGreaterThan('seed: \n'.length + 20);
  });
});

describe('summarizeError and describeConnectionFailure', () => {
  const coded = (code: string, message = ''): Error => Object.assign(new Error(message), { code });

  it.each([
    ['an AggregateError with empty inner errors and no codes', new AggregateError([new Error('')])],
    ['an AggregateError with nothing inside', new AggregateError([])],
    ['an empty Error', new Error('')],
    ['a whitespace-only Error', new Error('   \n')],
    ['an Error with only a code', coded('EACCES')],
    ['a nested AggregateError', new AggregateError([new AggregateError([coded('ECONNREFUSED')])])],
    ['a string', 'plain'],
    ['undefined', undefined],
  ])('gives a non-empty summary for %s', (_label, error) => {
    expect(summarizeError(error).trim()).not.toBe('');
  });

  it('falls back message, then inner messages, then code, then name', () => {
    expect(summarizeError(new Error('boom'))).toBe('boom');
    expect(
      summarizeError(new AggregateError([new Error('a'), new Error('a'), new Error('b')])),
    ).toBe('a; b');
    expect(summarizeError(coded('EACCES'))).toBe('EACCES');
    expect(summarizeError(new AggregateError([]))).toBe('AggregateError');
  });

  it('keeps the host and port out of nothing but the URL and never uses user, password or database', () => {
    const url = 'postgres://QaUser:QaSecretPw@localhost:5433/QaDb?application_name=QaApp';
    for (const error of [
      coded('ECONNREFUSED'),
      new AggregateError([coded('ECONNREFUSED'), coded('ECONNREFUSED')]),
      new AggregateError([coded('ENETUNREACH'), coded('ETIMEDOUT')]),
      new Error(''),
      new Error('boom'),
    ]) {
      const text = describeConnectionFailure(error, url);
      expect(text).toContain('localhost:5433');
      for (const secret of ['QaUser', 'QaSecretPw', 'QaDb', 'QaApp']) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it('uses 5432 when the URL names no port and brackets an IPv6 host', () => {
    expect(describeConnectionFailure(coded('ECONNREFUSED'), 'postgres://localhost/x')).toContain(
      'localhost:5432',
    );
    expect(describeConnectionFailure(coded('ECONNREFUSED'), 'postgres://[::1]:6000/x')).toContain(
      '[::1]:6000',
    );
  });

  it('does not suggest dev:up for a reason that is not a refused connection', () => {
    const text = describeConnectionFailure(
      new Error('password authentication failed'),
      'postgres://localhost/x',
    );
    expect(text).toBe('could not connect to localhost:5432: password authentication failed');
    expect(text).not.toContain('dev:up');
  });
});

describe('a failing rollback keeps the seed error (Bug 7)', () => {
  const clientFailing = (failOn: Record<string, Error>) => {
    const statements: string[] = [];
    const client: QueryClient = {
      query: (sql) => {
        statements.push(sql);
        const failure = failOn[sql];
        return failure === undefined ? Promise.resolve({ rows: [] }) : Promise.reject(failure);
      },
      end: () => Promise.resolve(),
    };
    return { client, statements };
  };

  it('a failed commit is rolled back and the commit error is the one thrown', async () => {
    const { client, statements } = clientFailing({ commit: new Error('commit failed') });
    await expect(
      createSeedDatabase(client, () => undefined).transaction(() => Promise.resolve(1)),
    ).rejects.toThrow('commit failed');
    expect(statements).toEqual(['begin', 'commit', 'rollback']);
  });

  it('a failed begin throws without trying to roll back', async () => {
    const { client, statements } = clientFailing({ begin: new Error('no connection') });
    await expect(
      createSeedDatabase(client, () => undefined).transaction(() => Promise.resolve(1)),
    ).rejects.toThrow('no connection');
    expect(statements).toEqual(['begin']);
  });

  it('warns only when the rollback fails, and only with the rollback reason', async () => {
    const quiet: string[] = [];
    const ok = clientFailing({});
    await expect(
      createSeedDatabase(ok.client, (line) => quiet.push(line)).transaction(() =>
        Promise.reject(new Error('seed error')),
      ),
    ).rejects.toThrow('seed error');
    expect(quiet).toEqual([]);

    const loud: string[] = [];
    const broken = clientFailing({
      rollback: Object.assign(new Error(''), { code: 'ECONNRESET' }),
    });
    await expect(
      createSeedDatabase(broken.client, (line) => loud.push(line)).transaction(() =>
        Promise.reject(new Error('seed error')),
      ),
    ).rejects.toThrow('seed error');
    expect(loud).toEqual(['rollback also failed: ECONNRESET']);
  });

  it('through runSeeds: the file failure reaches the user with the seed reason and no dev:up hint', async () => {
    const { client } = clientFailing({ rollback: new Error('connection terminated') });
    const warnings: string[] = [];
    const failing: SeedFile = {
      name: '001-a.sql',
      apply: () => Promise.reject(new Error('relation "demo" does not exist')),
    };
    const message = await runSeeds({
      target: { databaseUrl: 'postgres://pulse:pulse@localhost:5432/pulse' },
      database: createSeedDatabase(client, (line) => warnings.push(line)),
      files: [failing],
      log: () => undefined,
    }).then(
      () => 'resolved',
      (caught: unknown) => (caught instanceof Error ? caught.message : String(caught)),
    );
    expect(message).toBe(
      'Seed 001-a.sql failed and was rolled back: relation "demo" does not exist',
    );
    expect(message).not.toContain('dev:up');
    expect(warnings).toEqual(['rollback also failed: connection terminated']);
  });
});

describe('round 3: SeedApplyError never ends with an empty reason', () => {
  const failWith = async (
    reason: () => unknown,
  ): Promise<{ error: SeedApplyError; cause: unknown }> => {
    const statements: string[] = [];
    const client: QueryClient = {
      query: (sql) => {
        statements.push(sql);
        return Promise.resolve({ rows: [] });
      },
      end: () => Promise.resolve(),
    };
    const failing: SeedFile = {
      name: '001-a.sql',
      apply: () => {
        throw reason();
      },
    };
    const error = await runSeeds({
      target: { databaseUrl: 'postgres://pulse:pulse@localhost:5432/pulse' },
      database: createSeedDatabase(client, () => undefined),
      files: [failing],
      log: () => undefined,
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SeedApplyError);
    return { error: error as SeedApplyError, cause: (error as SeedApplyError).cause };
  };

  const prefix = 'Seed 001-a.sql failed and was rolled back: ';

  it.each([
    ['an empty Error', () => new Error(''), 'Error'],
    ['a whitespace Error', () => new Error('  '), 'Error'],
    [
      'an Error with only a code',
      () => Object.assign(new Error(''), { code: 'ECONNRESET' }),
      'ECONNRESET',
    ],
    ['an empty AggregateError', () => new AggregateError([]), 'AggregateError'],
    ['an AggregateError of empty errors', () => new AggregateError([new Error('')]), 'Error'],
    [
      'an AggregateError with messages',
      () => new AggregateError([new Error('x'), new Error('y')]),
      'x; y',
    ],
    ['a thrown string', () => 'plain', 'plain'],
    ['a thrown undefined', () => undefined, 'undefined'],
  ])('gives a readable reason for %s', async (_label, reason, expected) => {
    const { error } = await failWith(reason);
    expect(error.message).toBe(`${prefix}${expected}`);
    expect(error.seedName).toBe('001-a.sql');
  });

  it('keeps the original thrown value as the cause', async () => {
    const original = new Error('boom');
    const { cause } = await failWith(() => original);
    expect(cause).toBe(original);
  });

  it('keeps the error text of a normal failure unchanged', async () => {
    const { error } = await failWith(() => new Error('relation "demo" does not exist'));
    expect(error.message).toBe(`${prefix}relation "demo" does not exist`);
  });
});
