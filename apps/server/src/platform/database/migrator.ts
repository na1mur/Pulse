import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely, type Transaction } from 'kysely';

/**
 * One versioned schema change written as raw SQL (D-20). Files in `migrations/` are
 * `NNNN-name.up.sql` and `NNNN-name.down.sql`; numbers start at 0001 and have no gaps.
 */
export interface Migration {
  readonly id: string;
  readonly name: string;
  readonly up: string;
  readonly down: string;
}

export interface MigrationResult {
  readonly direction: 'up' | 'down';
  /** Migrations applied (in order) or rolled back (newest first) by this call. */
  readonly ids: readonly string[];
}

export interface MigrateOptions {
  /** Defaults to the shipped migrations (`loadMigrations()`). */
  readonly migrations?: readonly Migration[];
  /** Down only: how many migrations to roll back; default all of them. */
  readonly steps?: number;
}

/** The database and the shipped migrations disagree, or a migration script is malformed. */
export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

export const defaultMigrationsDirectory = new URL('./migrations/', import.meta.url);

const fileNamePattern = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.(up|down)\.sql$/;

/** Reads and validates a migrations folder. A file that does not fit the convention is an error. */
export async function loadMigrations(
  directory: string | URL = defaultMigrationsDirectory,
): Promise<Migration[]> {
  const folder = typeof directory === 'string' ? directory : fileURLToPath(directory);
  const parts = new Map<string, { name: string; up?: string; down?: string }>();
  for (const fileName of (await readdir(folder)).sort()) {
    const match = fileNamePattern.exec(fileName);
    if (match === null) {
      throw new MigrationError(`"${fileName}" is not named NNNN-name.up.sql or NNNN-name.down.sql`);
    }
    const [, id = '', name = '', direction = ''] = match;
    const entry = parts.get(id) ?? { name };
    if (entry.name !== name) {
      throw new MigrationError(`migration ${id} has two names: "${entry.name}" and "${name}"`);
    }
    const text = await readFile(join(folder, fileName), 'utf8');
    if (text.trim() === '') {
      throw new MigrationError(`migration ${id} ${direction} script is empty`);
    }
    entry[direction as 'up' | 'down'] = text;
    parts.set(id, entry);
  }

  return [...parts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { name, up, down }], index) => {
      const expected = String(index + 1).padStart(4, '0');
      if (id !== expected) {
        throw new MigrationError(`migration ${id} found where ${expected} was expected (gap)`);
      }
      if (up === undefined) throw new MigrationError(`migration ${id} has no up script`);
      if (down === undefined) throw new MigrationError(`migration ${id} has no down script`);
      return { id, name, up, down };
    });
}

/**
 * Applies pending migrations (`up`) or rolls them back (`down`).
 *
 * Each migration runs in its own transaction together with its bookkeeping row, behind a
 * transaction-scoped advisory lock, so concurrent server starts queue up and the second one finds
 * everything applied. The bookkeeping table `schema_migrations` is created by the first migration
 * run and dropped by the rollback of the last one: a full `down` leaves an empty database.
 */
export async function migrate(
  db: AnyDatabase,
  direction: 'up' | 'down',
  options: MigrateOptions = {},
): Promise<MigrationResult> {
  const migrations = options.migrations ?? (await loadMigrations());
  const ids =
    direction === 'up'
      ? await migrateUp(db, migrations)
      : await migrateDown(db, migrations, options.steps ?? Number.POSITIVE_INFINITY);
  return { direction, ids };
}

interface AppliedRow {
  readonly id: string;
  readonly checksum: string;
}

// Migrations run raw SQL against any schema, so they take any Kysely (Kysely's own Migrator does the same).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the line above
type AnyDatabase = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AnyDatabase
type Tx = Transaction<any>;

async function migrateUp(db: AnyDatabase, migrations: readonly Migration[]): Promise<string[]> {
  const applied: string[] = [];
  for (const migration of migrations) {
    const ran = await db.transaction().execute(async (tx) => {
      await prepare(tx);
      await sql`
        create table if not exists schema_migrations (
          id text primary key,
          name text not null,
          checksum text not null,
          applied_at timestamptz not null default now()
        )`.execute(tx);
      const rows = await appliedRows(tx);
      verifyHistory(rows, migrations);
      if (rows.some((row) => row.id === migration.id)) return false;
      await sql.raw(migration.up).execute(tx);
      await sql`
        insert into schema_migrations (id, name, checksum)
        values (${migration.id}, ${migration.name}, ${checksum(migration.up)})`.execute(tx);
      return true;
    });
    if (ran) applied.push(migration.id);
  }
  return applied;
}

async function migrateDown(
  db: AnyDatabase,
  migrations: readonly Migration[],
  steps: number,
): Promise<string[]> {
  const rolledBack: string[] = [];
  while (rolledBack.length < steps) {
    const id = await db.transaction().execute(async (tx) => {
      await prepare(tx);
      const exists = await sql<{ present: boolean }>`
        select to_regclass('schema_migrations') is not null as present`.execute(tx);
      if (exists.rows[0]?.present !== true) return undefined;
      const rows = await appliedRows(tx);
      verifyHistory(rows, migrations);
      const newest = rows.at(-1);
      if (newest === undefined) {
        await sql`drop table schema_migrations`.execute(tx);
        return undefined;
      }
      // verifyHistory proved every applied id is one of `migrations`.
      const migration = migrations.find((candidate) => candidate.id === newest.id);
      if (migration === undefined) return undefined;
      await sql.raw(migration.down).execute(tx);
      await sql`delete from schema_migrations where id = ${migration.id}`.execute(tx);
      if (rows.length === 1) await sql`drop table schema_migrations`.execute(tx);
      return migration.id;
    });
    if (id === undefined) break;
    rolledBack.push(id);
  }
  return rolledBack;
}

/**
 * Queues behind other starting servers, and lifts the statement timeout the application's pool
 * sets for requests (T1.2): a long migration must not be cancelled half way (the transaction
 * would roll back, so nothing is lost, but the server could never start).
 */
async function prepare(tx: Tx): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext('pulse.schema_migrations'))`.execute(tx);
  await sql`set local statement_timeout = 0`.execute(tx);
}

async function appliedRows(tx: Tx): Promise<AppliedRow[]> {
  const result =
    await sql<AppliedRow>`select id, checksum from schema_migrations order by id`.execute(tx);
  return result.rows;
}

/** The applied rows must be the first N known migrations, unedited. */
function verifyHistory(rows: readonly AppliedRow[], migrations: readonly Migration[]): void {
  rows.forEach((row, index) => {
    const known = migrations[index];
    if (known?.id !== row.id) {
      throw new MigrationError(
        `the database has migration ${row.id}, which this version of the server does not know ` +
          '(a newer server migrated it, or its history was edited); refusing to touch the schema',
      );
    }
    if (checksum(known.up) !== row.checksum) {
      throw new MigrationError(
        `migration ${row.id} (${known.name}) changed after it was applied; add a new migration instead`,
      );
    }
  });
}

/** Line endings are normalised so a Windows checkout and a Linux image agree. */
function checksum(script: string): string {
  return createHash('sha256').update(script.replaceAll('\r\n', '\n')).digest('hex');
}
