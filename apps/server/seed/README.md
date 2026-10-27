# Dev seed data

Demo data for the local development database. `pnpm --filter @pulse/server seed` (the root alias is `pnpm dev:seed`) applies every file in this folder that has not run yet, in name order. The folder is empty for now; later tasks add the demo user, sessions and so on. The schema comes from the server's migrations (T1.1), which run when the server starts, so a seed that writes to a table needs the server to have started once against that database.

## Convention

- File names are `NNN-name.sql` or `NNN-name.ts`: exactly three digits, then lowercase words joined by hyphens (`001-demo-user.sql`, `010-demo-sessions.ts`). Files run in name order, so the number decides the order. Two files may not share a number, and any other file name in this folder (apart from this README and dotfiles) is an error, so a typo never skips a seed silently.
- A `.sql` file is plain SQL, sent to the database as one multi-statement query. Do not write `BEGIN` or `COMMIT`: the runner wraps every file in its own transaction. A stray `COMMIT` keeps the rows written before it even when the file later fails, although the error still says "rolled back" and the file is not recorded, so fix the file and use `pnpm dev:reset` before retrying.
- A `.ts` file exports a default function that receives the transaction. Node runs it directly (types are stripped, there is no build step), so use `import type` for types and only erasable TypeScript syntax (no enums, no constructor parameter properties):

  ```ts
  import type { SeedContext } from '../scripts/seed/seed-runner.ts';

  export default async function seed(tx: SeedContext): Promise<void> {
    await tx.query('insert into ... values ($1)', ['value']);
  }
  ```

- Seeds are demo data only. Never put a real person's data or a real secret in them. Seed through SQL or the repositories' tables, not the HTTP API.
- Write seeds so they can be read by a stranger: dated, fictional, and clearly marked as demo data. They must not depend on the wall clock; use fixed instants.

## How it runs

- Applied seeds are recorded by file name in a `dev_seeds` table that the runner creates itself (`name`, `applied_at`). A rerun skips every recorded file, so running it twice changes nothing.
- Each file runs in one transaction together with its `dev_seeds` record. If a file fails, only that file is rolled back, earlier files stay applied, the run stops with the file name and the database error, and the next run retries the failed file.
- `dev_seeds` is dev-only bookkeeping that the runner creates at run time, outside the migration history. T1.1's migrations must not drop it, rely on it or diff against it; `pnpm dev:reset` removes it together with the volume.
- Concurrent runs queue on a Postgres advisory lock instead of applying a file twice.
- An applied file is never run again, even if you edit it. To change demo data, add a new file, or reset the whole dev database (`pnpm dev:reset`, which drops the volume) and seed again.
- The runner connects with `DATABASE_URL` (default `postgres://pulse:pulse@localhost:5432/pulse`, the database of the dev compose file).

## Safety

The runner refuses to run, exits with code 2 and touches nothing when:

- `NODE_ENV` is `production`, or
- the database host in `DATABASE_URL` is not `localhost`, `127.0.0.1` or `::1`. A URL with no host, a socket path, several hosts, or a `host=` / `hostaddr=` parameter that could point elsewhere is refused too.

The check runs before the runner connects and again before its first query. Messages never print the URL's password.

The runner lives in `apps/server/scripts/seed/` and is not part of the NestJS app or of the build output (`dist/`).
