// `pnpm --filter @pulse/server seed`: apply apps/server/seed/NNN-name.sql|ts to the dev database.
// A dev tool, not part of the NestJS app or its build (tsconfig.build.json only compiles src/);
// Node runs this file directly by stripping the types. Convention: apps/server/seed/README.md.
import { fileURLToPath } from 'node:url';
import { assertDevTarget, SeedRefusedError } from './dev-target.ts';
import { connectSeedDatabase } from './pg-database.ts';
import { describeConnectionFailure, summarizeError } from './seed-failure.ts';
import { loadSeedFiles } from './seed-files.ts';
import { runSeeds, type Log } from './seed-runner.ts';

// The dev database of infra/docker-compose.dev.yml (T0.6): dev-only credentials, loopback only.
const DEV_DATABASE_URL = 'postgres://pulse:pulse@localhost:5432/pulse';

const SEED_DIR = fileURLToPath(new URL('../../seed', import.meta.url));

const log: Log = (line) => {
  process.stdout.write(`${line}\n`);
};

const warn: Log = (line) => {
  process.stderr.write(`seed: ${line}\n`);
};

async function main(): Promise<void> {
  const target = {
    databaseUrl: process.env['DATABASE_URL'] ?? DEV_DATABASE_URL,
    ...(process.env['NODE_ENV'] === undefined ? {} : { nodeEnv: process.env['NODE_ENV'] }),
  };
  // Refuse before connecting or reading anything (runSeeds checks again before its first query).
  assertDevTarget(target);

  const files = await loadSeedFiles(SEED_DIR);
  const database = await connectSeedDatabase(target.databaseUrl, warn).catch((error: unknown) => {
    throw new Error(describeConnectionFailure(error, target.databaseUrl), { cause: error });
  });
  try {
    await runSeeds({ target, database, files, log });
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  warn(summarizeError(error));
  // A refusal is the safety net working, a failure is a problem: tell them apart for scripts.
  process.exitCode = error instanceof SeedRefusedError ? 2 : 1;
});
