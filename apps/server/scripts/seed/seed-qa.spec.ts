// QA edge cases for the T0.6 seed runner: parser tricks against the dev-target check, file naming
// and ordering, the .ts seed contract under real Node type stripping, and the real entry point
// (main.ts) refusing before it connects. No PostgreSQL is needed or contacted.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SeedRefusedError, assertDevTarget } from './dev-target.ts';
import { loadSeedFiles } from './seed-files.ts';
import {
  SeedFileNameError,
  orderSeedFiles,
  runSeeds,
  type SeedContext,
  type SeedDatabase,
  type SeedFile,
} from './seed-runner.ts';

const accepted = (databaseUrl: string): boolean => {
  try {
    assertDevTarget({ databaseUrl });
    return true;
  } catch (error) {
    if (error instanceof SeedRefusedError) return false;
    throw error;
  }
};

describe('assertDevTarget: parser tricks (T0.6 review focus, never a non-dev database)', () => {
  it.each([
    'postgres://localhost@evil.com/x', // userinfo looks like a host, the host is evil.com
    'postgres://localhost:pw@evil.com/x',
    'postgres://localhost:5432@evil.com/x',
    'postgres://localhost.evil.com/x',
    'postgres://127.0.0.1.evil.com/x',
    'postgres://evil.com#@localhost/x', // fragment hides the real @localhost
    'postgres://localhost%2eevil.com/x',
    'postgres://%6cocalhost/x', // percent-encoded: refused rather than decoded (fail closed)
    'postgres://localhost./x', // trailing dot: refused rather than normalised
    'postgres://localhost,evil.com/x',
    'postgres://localhost:5432,evil.com:5432/x',
    'postgres://127.0.0.2/x',
    'postgres://127.1/x',
    'postgres://2130706433/x',
    'postgres://0x7f.0.0.1/x',
    'postgres://0.0.0.0/x',
    'postgres://[::ffff:127.0.0.1]/x',
    'postgres://[::2]/x',
    'postgres://::1/x',
    'postgres:///x',
    'postgres://pulse@/x',
    '/var/run/postgresql',
    'postgres://localhost/x?host=evil.com',
    'postgres://localhost/x?host=',
    'postgres://localhost/x?hostaddr=',
    'postgres://localhost/x?%68ost=evil.com', // an encoded parameter name is still `host`
    'postgres://localhost/x?a=1&host=evil.com',
    'postgres://localhost/x?host=evil.com&host=localhost',
    'postgres://localhost/x?uselibpqcompat=true&host=evil.com',
    'localhost',
    '',
  ])('refuses %j', (url) => {
    expect(accepted(url)).toBe(false);
  });

  it.each([
    'postgres://pulse:pulse@localhost:5432/pulse',
    'postgres://pulse:pulse@LOCALHOST:5432/pulse',
    'postgres://pulse:pulse@127.0.0.1/pulse',
    'postgres://pulse:pulse@[::1]/pulse',
    'postgres://pulse:pulse@[0:0:0:0:0:0:0:1]:5433/pulse', // normalised to [::1] by the URL parser
    'postgres://evil.com@localhost/x', // userinfo only
    'postgres://user:p@ss@localhost/x', // @ inside the password
    'postgresql://localhost/x',
    'postgres://localhost/x?sslmode=disable',
  ])('accepts the genuine loopback target %j', (url) => {
    expect(accepted(url)).toBe(true);
  });

  it('matches NODE_ENV=production whatever the case, padding or database host', () => {
    for (const nodeEnv of [
      'production',
      'PRODUCTION',
      ' production ',
      'Production\n',
      '\tproduction',
    ]) {
      expect(() => {
        assertDevTarget({ databaseUrl: 'postgres://localhost/x', nodeEnv });
      }).toThrow(SeedRefusedError);
    }
  });

  it('says why in the message for each class of refusal, never with the password', () => {
    const secret = 'S3cret-pw';
    const urls = [
      `postgres://pulse:${secret}@db.example.com/pulse`,
      `postgres://pulse:${secret}@localhost/pulse?host=db.example.com`,
      `postgres://pulse:${secret}@`,
      `postgres://pulse:${secret}@localhost,db.example.com/pulse`,
    ];
    for (const databaseUrl of urls) {
      try {
        assertDevTarget({ databaseUrl, nodeEnv: 'production' });
        expect.unreachable();
      } catch (error) {
        expect((error as Error).message).not.toContain(secret);
      }
      try {
        assertDevTarget({ databaseUrl });
        expect.unreachable();
      } catch (error) {
        expect((error as Error).message).not.toContain(secret);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------

const file = (name: string, apply: SeedFile['apply'] = () => Promise.resolve()): SeedFile => ({
  name,
  apply,
});

describe('orderSeedFiles: naming and ordering edge cases', () => {
  it.each([
    '1-a.sql',
    '01-a.sql',
    '0001-a.sql',
    '001.sql',
    '001-.sql',
    '001--a.sql',
    '001-a-.sql',
    '001-A.sql',
    '001-a_b.sql',
    '001-a b.sql',
    '001-a.SQL',
    '001-a.mts',
    '001-a.js',
    '001-a.d.ts',
    '001-a.sql.bak',
    '001-a.sql ',
    ' 001-a.sql',
    'a-001.sql',
    'readme.md',
    'Thumbs.db',
    'desktop.ini',
  ])('rejects %j instead of skipping it', (name) => {
    expect(() => orderSeedFiles([file(name)])).toThrow(SeedFileNameError);
  });

  it('rejects the same number across .sql and .ts and across different words', () => {
    expect(() => orderSeedFiles([file('001-a.sql'), file('001-b.ts')])).toThrow(
      /share the number 001/,
    );
    expect(() => orderSeedFiles([file('001-a.sql'), file('001-a.ts')])).toThrow(
      /share the number 001/,
    );
  });

  it('orders by number, not by length or by the words', () => {
    const names = orderSeedFiles(
      ['100-z.ts', '010-a.sql', '002-m.sql', '999-last.ts', '000-zero.sql'].map((n) => file(n)),
    ).map((f) => f.name);
    expect(names).toEqual(['000-zero.sql', '002-m.sql', '010-a.sql', '100-z.ts', '999-last.ts']);
  });
});

// A small in-memory database with real transaction semantics (copy on begin, restore on throw).
function memoryDatabase(): { database: SeedDatabase; recorded: () => string[] } {
  let seeds = new Set<string>();
  let table = false;
  const database: SeedDatabase = {
    transaction: async (work) => {
      const snapshot = { seeds: new Set(seeds), table };
      const tx: SeedContext = {
        query: (sql, params) => {
          if (sql.startsWith('create table if not exists dev_seeds')) {
            table = true;
          } else if (sql.startsWith('select name from dev_seeds')) {
            return Promise.resolve({ rows: seeds.has(String(params?.[0])) ? [{}] : [] });
          } else if (sql.startsWith('insert into dev_seeds')) {
            seeds.add(String(params?.[0]));
          }
          return Promise.resolve({ rows: [] });
        },
      };
      try {
        return await work(tx);
      } catch (error) {
        seeds = snapshot.seeds;
        table = snapshot.table;
        throw error;
      }
    },
  };
  return { database, recorded: () => [...seeds].sort() };
}

describe('runSeeds: failure rollback and rerun', () => {
  const target = { databaseUrl: 'postgres://pulse:pulse@localhost:5432/pulse' };

  it('a first-file failure records nothing, runs nothing after it, and the retry applies all', async () => {
    const { database, recorded } = memoryDatabase();
    const ran: string[] = [];
    let broken = true;
    const files = [
      file('001-a.sql', () => {
        ran.push('001');
        return broken ? Promise.reject(new Error('boom')) : Promise.resolve();
      }),
      file('002-b.sql', () => {
        ran.push('002');
        return Promise.resolve();
      }),
    ];
    await expect(runSeeds({ target, database, files, log: () => undefined })).rejects.toThrow(
      /001-a\.sql failed and was rolled back: boom/,
    );
    expect(recorded()).toEqual([]);
    expect(ran).toEqual(['001']);

    broken = false;
    const result = await runSeeds({ target, database, files, log: () => undefined });
    expect(result.applied).toEqual(['001-a.sql', '002-b.sql']);
    expect(recorded()).toEqual(['001-a.sql', '002-b.sql']);
  });

  it('puts the failing file error text in the message', async () => {
    const { database } = memoryDatabase();
    const files = [file('001-a.sql', () => Promise.reject(new Error('plain string')))];
    await expect(runSeeds({ target, database, files, log: () => undefined })).rejects.toThrow(
      /plain string/,
    );
  });

  it('refuses a bad name before creating dev_seeds or applying anything', async () => {
    const { database, recorded } = memoryDatabase();
    const ran: string[] = [];
    const files = [
      file('001-a.sql', () => {
        ran.push('001');
        return Promise.resolve();
      }),
      file('bad name.sql'),
    ];
    await expect(runSeeds({ target, database, files, log: () => undefined })).rejects.toThrow(
      SeedFileNameError,
    );
    expect(ran).toEqual([]);
    expect(recorded()).toEqual([]);
  });

  it('a refused target never reaches the database, whatever the files', async () => {
    let touched = false;
    const database: SeedDatabase = {
      transaction: () => {
        touched = true;
        return Promise.reject(new Error('must not be reached'));
      },
    };
    for (const databaseUrl of [
      'postgres://pulse:pulse@localhost.evil.com/pulse',
      'postgres://localhost/pulse?host=evil.com',
    ]) {
      await expect(
        runSeeds({ target: { databaseUrl }, database, files: [], log: () => undefined }),
      ).rejects.toThrow(SeedRefusedError);
    }
    await expect(
      runSeeds({
        target: { databaseUrl: target.databaseUrl, nodeEnv: 'production' },
        database,
        files: [],
        log: () => undefined,
      }),
    ).rejects.toThrow(SeedRefusedError);
    expect(touched).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------

describe('seed folder and the .ts contract under real Node', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pulse-seed-qa-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ignores README.md and dotfiles, lists the rest in order, rejects a lowercase readme', async () => {
    writeFileSync(join(dir, 'README.md'), 'x');
    writeFileSync(join(dir, '.gitkeep'), '');
    writeFileSync(join(dir, '.DS_Store'), '');
    writeFileSync(join(dir, '010-b.sql'), 'select 1');
    writeFileSync(join(dir, '002-a.ts'), 'export default () => {}');
    expect((await loadSeedFiles(dir)).map((f) => f.name)).toEqual(['002-a.ts', '010-b.sql']);

    // A second folder: on a case-insensitive file system readme.md would overwrite README.md.
    const other = mkdtempSync(join(tmpdir(), 'pulse-seed-qa-'));
    try {
      writeFileSync(join(other, 'readme.md'), 'x');
      await expect(loadSeedFiles(other)).rejects.toThrow(SeedFileNameError);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('rejects a folder named like a seed', async () => {
    mkdirSync(join(dir, '001-a.sql'));
    await expect(loadSeedFiles(dir)).rejects.toThrow(/not a file/);
  });

  it('rejects duplicate numbers read from disk', async () => {
    writeFileSync(join(dir, '001-a.sql'), 'select 1');
    writeFileSync(join(dir, '001-b.ts'), 'export default () => {}');
    await expect(loadSeedFiles(dir)).rejects.toThrow(/share the number 001/);
  });

  // Vitest transforms modules itself, so the ".ts runs with Node's own type stripping" promise of
  // the README needs a real `node` process.
  const nodeRun = (script: string): { status: number | null; stdout: string; stderr: string } => {
    const loader = new URL('./seed-files.ts', import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { loadSeedFiles } from ${JSON.stringify(loader)};\n${script}`,
      ],
      { encoding: 'utf8', env: { ...process.env, SEED_DIR: dir } },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  it('runs a .ts seed with erasable types, as the README example does', () => {
    writeFileSync(
      join(dir, '001-ok.ts'),
      [
        "import type { SeedContext } from 'whatever-is-erased';",
        'export default async function seed(tx: SeedContext): Promise<void> {',
        "  await tx.query('ran-from-ts', ['p']);",
        '}',
      ].join('\n'),
    );
    const out = nodeRun(`
      const [seed] = await loadSeedFiles(process.env.SEED_DIR);
      const calls = [];
      await seed.apply({ query: async (sql, params) => { calls.push([sql, params]); return { rows: [] }; } });
      console.log(JSON.stringify(calls));
    `);
    expect(out.stderr).toBe('');
    expect(JSON.parse(out.stdout)).toEqual([['ran-from-ts', ['p']]]);
  });

  it('fails a .ts seed with non-erasable syntax (enum, parameter property) naming the problem', () => {
    writeFileSync(join(dir, '001-enum.ts'), 'enum E { A }\nexport default () => E.A;');
    const out = nodeRun(`
      const [seed] = await loadSeedFiles(process.env.SEED_DIR);
      try { await seed.apply({ query: async () => ({ rows: [] }) }); console.log('NO-ERROR'); }
      catch (e) { console.log('ERROR ' + e.message.split('\\n')[0]); }
    `);
    expect(out.stdout).toMatch(/^ERROR /);
    expect(out.stdout).not.toContain('NO-ERROR');
  });

  it.each([
    ['a default export that is not a function', 'export default 42;'],
    ['only a named export', 'export const seed = () => {};'],
    ['no exports', 'const x = 1;'],
  ])('fails a .ts seed with %s', (_label, source) => {
    writeFileSync(join(dir, '001-shape.ts'), source);
    const out = nodeRun(`
      const [seed] = await loadSeedFiles(process.env.SEED_DIR);
      try { await seed.apply({ query: async () => ({ rows: [] }) }); console.log('NO-ERROR'); }
      catch (e) { console.log('ERROR ' + e.message); }
    `);
    expect(out.stdout).toMatch(/ERROR 001-shape\.ts must export a default function/);
  });
});

// ---------------------------------------------------------------------------------------------

describe('main.ts refuses before it reads the seed folder or connects (real process)', () => {
  const serverDir = fileURLToPath(new URL('../../', import.meta.url));
  const main = (env: Record<string, string>) => {
    const base = { ...process.env };
    delete base['DATABASE_URL'];
    delete base['NODE_ENV'];
    return spawnSync(process.execPath, ['scripts/seed/main.ts'], {
      cwd: serverDir,
      encoding: 'utf8',
      env: { ...base, ...env },
    });
  };

  it.each([
    ['production', { NODE_ENV: 'production' }],
    ['a remote host', { DATABASE_URL: 'postgres://pulse:TopSecretPw@db.example.com:5432/pulse' }],
    [
      'a host override',
      { DATABASE_URL: 'postgres://pulse:TopSecretPw@localhost/pulse?host=db.example.com' },
    ],
    [
      'a userinfo trick',
      { DATABASE_URL: 'postgres://localhost:TopSecretPw@evil.example.com/pulse' },
    ],
    ['a socket path', { DATABASE_URL: '/var/run/postgresql' }],
    ['an unparseable value', { DATABASE_URL: 'not a url TopSecretPw' }],
  ])('exits 2 for %s, prints no secret and writes nothing to stdout', (_label, env) => {
    const result = main(env);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^seed: Refusing to seed/);
    expect(result.stderr).not.toContain('TopSecretPw');
  });

  it('production wins even when the database is local', () => {
    const result = main({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://pulse:pulse@localhost/pulse',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/NODE_ENV=production/);
  });
});
