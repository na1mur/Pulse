import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.factory.js';
import type { Database } from './database.types.js';
import { loadMigrations, migrate, MigrationError, type Migration } from './migrator.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from './test-database.testing.js';

const widgets: Migration = {
  id: '0001',
  name: 'widgets',
  up: 'create table widgets (id int primary key);\ncreate index widgets_id_idx on widgets (id);',
  down: 'drop table widgets;',
};
const gadgets: Migration = {
  id: '0002',
  name: 'gadgets',
  up: 'create table gadgets (id int primary key, widget_id int references widgets (id));',
  down: 'drop table gadgets;',
};
const fixtures: readonly Migration[] = [widgets, gadgets];

async function userTables(db: Kysely<Database>): Promise<string[]> {
  const result = await sql<{ tablename: string }>`
    select tablename from pg_tables where schemaname = 'public' order by tablename`.execute(db);
  return result.rows.map((row) => row.tablename);
}

describe('loadMigrations', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pulse-migrations-'));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function folder(files: Record<string, string>): Promise<string> {
    const target = await mkdtemp(join(directory, 'case-'));
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(target, name), content);
    }
    return target;
  }

  it('reads up and down pairs in id order', async () => {
    const target = await folder({
      '0002-b.up.sql': 'select 2;',
      '0002-b.down.sql': 'select -2;',
      '0001-a-first.up.sql': 'select 1;',
      '0001-a-first.down.sql': 'select -1;',
    });
    await expect(loadMigrations(target)).resolves.toEqual([
      { id: '0001', name: 'a-first', up: 'select 1;', down: 'select -1;' },
      { id: '0002', name: 'b', up: 'select 2;', down: 'select -2;' },
    ]);
  });

  it.each([
    ['a missing down file', { '0001-a.up.sql': 'select 1;' }, /0001.*down/],
    ['a missing up file', { '0001-a.down.sql': 'select 1;' }, /0001.*up/],
    [
      'a gap in the numbering',
      { '0002-a.up.sql': 'x', '0002-a.down.sql': 'x' },
      /0001 was expected/,
    ],
    [
      'two names for one number',
      {
        '0001-a.up.sql': 'x',
        '0001-a.down.sql': 'x',
        '0001-b.up.sql': 'x',
        '0001-b.down.sql': 'x',
      },
      /0001/,
    ],
    ['a misnamed file', { '1-a.up.sql': 'x' }, /1-a\.up\.sql/],
    ['an empty script', { '0001-a.up.sql': ' \n', '0001-a.down.sql': 'x' }, /0001.*empty/],
  ])('rejects %s instead of skipping it', async (_label, files, message) => {
    const target = await folder(files);
    await expect(loadMigrations(target)).rejects.toThrow(message);
  });

  it('loads the shipped migrations', async () => {
    const shipped = await loadMigrations();
    expect(shipped.length).toBeGreaterThan(0);
    expect(shipped[0]?.id).toBe('0001');
  });
});

describe.skipIf(databaseTestsSkipped)('migrate (real PostgreSQL)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.drop();
  });

  // Every test starts on an empty database (and the last assertion of each cleans up again).
  async function reset(): Promise<void> {
    await migrate(database.db, 'down', { migrations: fixtures });
    expect(await userTables(database.db)).toEqual([]);
  }

  it('applies pending migrations in order and records them', async () => {
    await reset();
    const result = await migrate(database.db, 'up', { migrations: fixtures });

    expect(result).toEqual({ direction: 'up', ids: ['0001', '0002'] });
    expect(await userTables(database.db)).toEqual(['gadgets', 'schema_migrations', 'widgets']);
    const rows = await sql<{ id: string; name: string }>`
      select id, name from schema_migrations order by id`.execute(database.db);
    expect(rows.rows).toEqual([
      { id: '0001', name: 'widgets' },
      { id: '0002', name: 'gadgets' },
    ]);
  });

  it('does nothing on a second run', async () => {
    await reset();
    await migrate(database.db, 'up', { migrations: fixtures });
    const second = await migrate(database.db, 'up', { migrations: fixtures });
    expect(second).toEqual({ direction: 'up', ids: [] });
  });

  it('rolls back to an empty database, bookkeeping table included, and applies again', async () => {
    await reset();
    await migrate(database.db, 'up', { migrations: fixtures });

    const down = await migrate(database.db, 'down', { migrations: fixtures });
    expect(down).toEqual({ direction: 'down', ids: ['0002', '0001'] });
    expect(await userTables(database.db)).toEqual([]);

    expect(await migrate(database.db, 'down', { migrations: fixtures })).toEqual({
      direction: 'down',
      ids: [],
    });
    expect(await migrate(database.db, 'up', { migrations: fixtures })).toEqual({
      direction: 'up',
      ids: ['0001', '0002'],
    });
  });

  it('rolls back a number of steps and keeps the bookkeeping table while any migration remains', async () => {
    await reset();
    await migrate(database.db, 'up', { migrations: fixtures });

    const result = await migrate(database.db, 'down', { migrations: fixtures, steps: 1 });
    expect(result.ids).toEqual(['0002']);
    expect(await userTables(database.db)).toEqual(['schema_migrations', 'widgets']);
  });

  it('is safe when several servers start at once: each migration is applied exactly once', async () => {
    await reset();
    // Separate pools, like separate server processes. The fixtures are not idempotent (plain
    // `create table`), so a double apply would fail one of the runs.
    const starters = Array.from({ length: 6 }, () => createDatabase(database.url));
    try {
      const results = await Promise.all(
        starters.map((db) => migrate(db, 'up', { migrations: fixtures })),
      );
      const applied = results.flatMap((result) => result.ids).sort();
      expect(applied).toEqual(['0001', '0002']);
    } finally {
      await Promise.all(starters.map((db) => db.destroy()));
    }
  });

  it('rolls a failing migration back completely and applies none of the later ones', async () => {
    await reset();
    const broken: Migration[] = [
      widgets,
      {
        id: '0002',
        name: 'broken',
        up: 'create table half_done (id int); select * from does_not_exist;',
        down: 'drop table half_done;',
      },
      { id: '0003', name: 'never', up: 'create table never (id int);', down: 'drop table never;' },
    ];

    await expect(migrate(database.db, 'up', { migrations: broken })).rejects.toThrow(
      /does_not_exist/,
    );
    // 0001 stays applied, nothing of 0002 is left, 0003 did not run.
    expect(await userTables(database.db)).toEqual(['schema_migrations', 'widgets']);
    await reset();
  });

  it('leaves an empty database empty when the first migration fails', async () => {
    await reset();
    const broken: Migration[] = [
      { id: '0001', name: 'broken', up: 'select * from does_not_exist;', down: 'select 1;' },
    ];
    await expect(migrate(database.db, 'up', { migrations: broken })).rejects.toThrow(
      /does_not_exist/,
    );
    expect(await userTables(database.db)).toEqual([]);
  });

  it('refuses to run when the database has migrations this code does not know', async () => {
    await reset();
    await migrate(database.db, 'up', { migrations: fixtures });

    const older = [widgets];
    await expect(migrate(database.db, 'up', { migrations: older })).rejects.toThrow(MigrationError);
    await expect(migrate(database.db, 'up', { migrations: older })).rejects.toThrow(/0002/);
    await expect(migrate(database.db, 'down', { migrations: older })).rejects.toThrow(/0002/);
    await reset();
  });

  it('refuses to run when an applied migration was edited', async () => {
    await reset();
    await migrate(database.db, 'up', { migrations: fixtures });

    const edited = [{ ...widgets, up: 'create table widgets (id bigint);' }, gadgets];
    await expect(migrate(database.db, 'up', { migrations: edited })).rejects.toThrow(
      /0001.*changed/,
    );
    await reset();
  });

  it('treats line endings alike when comparing an applied migration', async () => {
    await reset();
    await migrate(database.db, 'up', { migrations: fixtures });
    const crlf = fixtures.map((m) => ({ ...m, up: m.up.replaceAll('\n', '\r\n') }));
    await expect(migrate(database.db, 'up', { migrations: crlf })).resolves.toEqual({
      direction: 'up',
      ids: [],
    });
    await reset();
  });
});
