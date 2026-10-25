import { assertDevTarget, type DevTarget } from './dev-target.ts';
import { summarizeError } from './seed-failure.ts';

/** Where the runner reports progress (and the CLI its warnings): one line per call. */
export type Log = (line: string) => void;

/** What a seed file can do inside its transaction. The pg adapter and the test fake implement it. */
export interface SeedContext {
  query(sql: string, params?: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

/** The database port: one transaction per seed file. Rolls back when `work` throws. */
export interface SeedDatabase {
  transaction<T>(work: (tx: SeedContext) => Promise<T>): Promise<T>;
}

/** A seed file ready to run. `name` is the file name, which is also the key in dev_seeds. */
export interface SeedFile {
  readonly name: string;
  apply(tx: SeedContext): Promise<void>;
}

export interface SeedRunResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export interface RunSeedsOptions {
  readonly target: DevTarget;
  readonly database: SeedDatabase;
  readonly files: readonly SeedFile[];
  readonly log: Log;
}

export class SeedFileNameError extends Error {
  override readonly name = 'SeedFileNameError';
}

/** A seed file failed; its transaction (and its dev_seeds record) was rolled back. */
export class SeedApplyError extends Error {
  override readonly name = 'SeedApplyError';

  // Not a constructor parameter property: Node strips types and cannot erase those.
  readonly seedName: string;

  constructor(seedName: string, cause: unknown) {
    super(`Seed ${seedName} failed and was rolled back: ${summarizeError(cause)}`, { cause });
    this.seedName = seedName;
  }
}

// Exactly three digits so that plain string order is numeric order (a 4-digit number would sort
// before 999 as text).
const SEED_NAME = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:sql|ts)$/;

// Arbitrary constant; concurrent runners queue on it instead of racing on dev_seeds.
const SEED_LOCK_SQL = "select pg_advisory_xact_lock(hashtext('pulse.dev_seeds'))";

const CREATE_TABLE = `create table if not exists dev_seeds (
  name text primary key,
  applied_at timestamptz not null default now()
)`;

/**
 * Name order, as the convention promises. Rejects what would otherwise be skipped or ordered
 * ambiguously: a misnamed file and two files with the same number.
 */
export function orderSeedFiles(files: readonly SeedFile[]): SeedFile[] {
  const numbers = new Map<string, string>();
  for (const { name } of files) {
    const match = SEED_NAME.exec(name);
    const number = match?.[1];
    if (number === undefined) {
      throw new SeedFileNameError(
        `Seed file "${name}" does not match NNN-name.sql or NNN-name.ts (three digits, then lowercase words joined by hyphens).`,
      );
    }
    const earlier = numbers.get(number);
    if (earlier !== undefined) {
      throw new SeedFileNameError(
        `Seed files "${earlier}" and "${name}" share the number ${number}; their order would be ambiguous.`,
      );
    }
    numbers.set(number, name);
  }
  return [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Applies the seed files that dev_seeds does not list yet, one transaction each. The dev-target
 * check runs first, so a refused target is never connected to. A failing file rolls back alone
 * (earlier files stay recorded) and stops the run; the next run retries it.
 */
export async function runSeeds(options: RunSeedsOptions): Promise<SeedRunResult> {
  const { target, database, log } = options;
  assertDevTarget(target);
  const files = orderSeedFiles(options.files);

  await database.transaction(async (tx) => {
    await tx.query(SEED_LOCK_SQL);
    await tx.query(CREATE_TABLE);
  });

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const wasApplied = await applyOne(database, file, log);
    (wasApplied ? applied : skipped).push(file.name);
  }

  if (files.length === 0) {
    log('No seed files in apps/server/seed yet; nothing to apply.');
  } else {
    log(`Seeds: applied ${applied.length}, skipped ${skipped.length} (already applied).`);
  }
  return { applied, skipped };
}

async function applyOne(database: SeedDatabase, file: SeedFile, log: Log): Promise<boolean> {
  try {
    return await database.transaction(async (tx) => {
      await tx.query(SEED_LOCK_SQL);
      const seen = await tx.query('select name from dev_seeds where name = $1', [file.name]);
      if (seen.rows.length > 0) {
        log(`skip  ${file.name} (already applied)`);
        return false;
      }
      log(`apply ${file.name}`);
      await file.apply(tx);
      await tx.query('insert into dev_seeds (name) values ($1)', [file.name]);
      return true;
    });
  } catch (error) {
    throw new SeedApplyError(file.name, error);
  }
}
