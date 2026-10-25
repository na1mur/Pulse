import { describe, expect, it } from 'vitest';
import { SeedRefusedError } from './dev-target.ts';
import {
  SeedApplyError,
  SeedFileNameError,
  orderSeedFiles,
  runSeeds,
  type SeedContext,
  type SeedDatabase,
  type SeedFile,
} from './seed-runner.ts';

/**
 * In-memory stand-in for the database port. It understands only the statements the runner owns
 * (the dev_seeds bookkeeping and the advisory lock); a seed file's own work is a function that
 * records into `effects`. A rolled-back transaction discards both the effects and the bookkeeping.
 */
class FakeDatabase implements SeedDatabase {
  readonly applied = new Set<string>();
  readonly effects: string[] = [];
  readonly statements: string[] = [];
  tableCreated = false;
  transactions = 0;
  rollbacks = 0;

  async transaction<T>(work: (tx: SeedContext) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const appliedBefore = [...this.applied];
    const effectsBefore = [...this.effects];
    const tableBefore = this.tableCreated;
    try {
      return await work({ query: (sql, params) => this.query(sql, params) });
    } catch (error) {
      this.rollbacks += 1;
      this.applied.clear();
      appliedBefore.forEach((name) => this.applied.add(name));
      this.effects.splice(0, this.effects.length, ...effectsBefore);
      this.tableCreated = tableBefore;
      throw error;
    }
  }

  private query(sql: string, params: readonly unknown[] = []): Promise<{ rows: [] }> {
    const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    this.statements.push(text);
    if (text.startsWith('create table if not exists dev_seeds')) {
      this.tableCreated = true;
    } else if (text.startsWith('select') && text.includes('from dev_seeds')) {
      if (!this.tableCreated) {
        return Promise.reject(new Error('relation "dev_seeds" does not exist'));
      }
      const found = this.applied.has(String(params[0]));
      return Promise.resolve({ rows: found ? ([{ name: params[0] }] as unknown as []) : [] });
    } else if (text.startsWith('insert into dev_seeds')) {
      this.applied.add(String(params[0]));
    }
    return Promise.resolve({ rows: [] });
  }
}

const localTarget = { databaseUrl: 'postgres://pulse:pulse@localhost:5432/pulse' };

const seedFile = (name: string, db: FakeDatabase, fail = false): SeedFile => ({
  name,
  apply: async () => {
    await Promise.resolve();
    if (fail) {
      throw new Error(`boom in ${name}`);
    }
    db.effects.push(name);
  },
});

const run = (db: FakeDatabase, files: readonly SeedFile[], target = localTarget) => {
  const lines: string[] = [];
  const result = runSeeds({
    target,
    database: db,
    files,
    log: (line) => lines.push(line),
  });
  return { result, lines };
};

describe('orderSeedFiles', () => {
  const names = (files: readonly SeedFile[]) => files.map((file) => file.name);
  const named = (...list: string[]): SeedFile[] =>
    list.map((name) => ({ name, apply: () => Promise.resolve() }));

  it('orders by file name, whatever order the directory listing came in', () => {
    const ordered = orderSeedFiles(
      named('010-sessions.sql', '002-demo-user.ts', '001-reset.sql', '100-late.ts'),
    );
    expect(names(ordered)).toEqual([
      '001-reset.sql',
      '002-demo-user.ts',
      '010-sessions.sql',
      '100-late.ts',
    ]);
  });

  it('does not mutate its input', () => {
    const input = named('002-b.sql', '001-a.sql');
    orderSeedFiles(input);
    expect(names(input)).toEqual(['002-b.sql', '001-a.sql']);
  });

  it.each([
    'seed.sql',
    '1-short.sql',
    '0001-long.sql',
    '001_underscore.sql',
    '001-Upper.sql',
    '001-name.txt',
    '001-.sql',
    '001-name.sql.bak',
    '001-name.mjs',
  ])('rejects the name %s instead of skipping it silently', (name) => {
    expect(() => orderSeedFiles(named(name))).toThrow(SeedFileNameError);
  });

  it('rejects two files with the same number, whose order would be ambiguous', () => {
    expect(() => orderSeedFiles(named('001-a.sql', '001-b.ts'))).toThrow(/001/);
  });
});

describe('runSeeds', () => {
  it('applies the files in name order and records each one', async () => {
    const db = new FakeDatabase();
    const files = [seedFile('002-b.sql', db), seedFile('001-a.sql', db), seedFile('003-c.ts', db)];

    const { result } = run(db, files);

    await expect(result).resolves.toEqual({
      applied: ['001-a.sql', '002-b.sql', '003-c.ts'],
      skipped: [],
    });
    expect(db.effects).toEqual(['001-a.sql', '002-b.sql', '003-c.ts']);
    expect([...db.applied]).toEqual(['001-a.sql', '002-b.sql', '003-c.ts']);
  });

  it('creates the dev_seeds table itself, even with nothing to apply', async () => {
    const db = new FakeDatabase();

    const { result, lines } = run(db, []);

    await expect(result).resolves.toEqual({ applied: [], skipped: [] });
    expect(db.tableCreated).toBe(true);
    expect(lines.join('\n')).toMatch(/no seed files/i);
  });

  it('is idempotent: a rerun applies nothing and changes nothing', async () => {
    const db = new FakeDatabase();
    const files = [seedFile('001-a.sql', db), seedFile('002-b.ts', db)];
    await run(db, files).result;

    const second = run(db, files);

    await expect(second.result).resolves.toEqual({
      applied: [],
      skipped: ['001-a.sql', '002-b.ts'],
    });
    expect(db.effects).toEqual(['001-a.sql', '002-b.ts']);
    expect(second.lines.join('\n')).toMatch(/skipped 2/);
  });

  it('applies only the files added since the last run', async () => {
    const db = new FakeDatabase();
    await run(db, [seedFile('001-a.sql', db)]).result;

    const { result } = run(db, [seedFile('001-a.sql', db), seedFile('002-b.sql', db)]);

    await expect(result).resolves.toEqual({ applied: ['002-b.sql'], skipped: ['001-a.sql'] });
    expect(db.effects).toEqual(['001-a.sql', '002-b.sql']);
  });

  it('serialises concurrent runners with a transaction-scoped advisory lock', async () => {
    const db = new FakeDatabase();

    await run(db, [seedFile('001-a.sql', db)]).result;

    // One for the bookkeeping table, one per seed file.
    expect(db.statements.filter((s) => s.includes('pg_advisory_xact_lock'))).toHaveLength(2);
  });

  it('rolls back a failing file with its record, keeps earlier files and stops', async () => {
    const db = new FakeDatabase();
    const files = [
      seedFile('001-a.sql', db),
      seedFile('002-broken.sql', db, true),
      seedFile('003-c.sql', db),
    ];

    const { result } = run(db, files);

    await expect(result).rejects.toThrow(SeedApplyError);
    await expect(result).rejects.toThrow(/002-broken\.sql/);
    expect(db.effects).toEqual(['001-a.sql']);
    expect([...db.applied]).toEqual(['001-a.sql']);
    expect(db.rollbacks).toBe(1);
  });

  it('keeps the original error as the cause of a failed file', async () => {
    const db = new FakeDatabase();

    const { result } = run(db, [seedFile('001-broken.sql', db, true)]);

    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SeedApplyError);
    expect((error as SeedApplyError).seedName).toBe('001-broken.sql');
    expect(((error as SeedApplyError).cause as Error).message).toBe('boom in 001-broken.sql');
  });

  it('gives a non-empty reason when the failing seed threw an error with an empty message', async () => {
    const db = new FakeDatabase();
    const silent: SeedFile = {
      name: '001-silent.sql',
      apply: () => Promise.reject(new AggregateError([new Error('::1 refused')], '')),
    };

    const { result } = run(db, [silent]);

    await expect(result).rejects.toThrow(/001-silent\.sql failed and was rolled back: \S+/);
    await expect(result).rejects.toThrow(/::1 refused/);
  });

  it('retries the failed file on the next run once it is fixed', async () => {
    const db = new FakeDatabase();
    await run(db, [seedFile('001-a.sql', db, true)]).result.catch(() => undefined);

    const { result } = run(db, [seedFile('001-a.sql', db)]);

    await expect(result).resolves.toEqual({ applied: ['001-a.sql'], skipped: [] });
  });

  it('logs what it applied and skipped', async () => {
    const db = new FakeDatabase();
    await run(db, [seedFile('001-a.sql', db)]).result;

    const { result, lines } = run(db, [seedFile('001-a.sql', db), seedFile('002-b.sql', db)]);
    await result;

    expect(lines).toContain('apply 002-b.sql');
    expect(lines).toContain('skip  001-a.sql (already applied)');
  });
});

describe('runSeeds refuses a non-dev database before touching it', () => {
  it.each([
    ['a non-local host', { databaseUrl: 'postgres://pulse:pulse@db.example.com/pulse' }],
    [
      'NODE_ENV=production',
      { databaseUrl: 'postgres://pulse:pulse@localhost/pulse', nodeEnv: 'production' },
    ],
  ])('on %s', async (_label, target) => {
    const db = new FakeDatabase();

    const { result } = run(db, [seedFile('001-a.sql', db)], target);

    await expect(result).rejects.toThrow(SeedRefusedError);
    expect(db.transactions).toBe(0);
    expect(db.statements).toEqual([]);
    expect(db.effects).toEqual([]);
  });

  it('refuses before even validating the file list', async () => {
    const db = new FakeDatabase();

    const { result } = run(db, [seedFile('bad name', db)], {
      databaseUrl: 'postgres://pulse:pulse@db.example.com/pulse',
    });

    await expect(result).rejects.toThrow(SeedRefusedError);
  });
});
