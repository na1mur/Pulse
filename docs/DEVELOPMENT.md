# Development guide

How to get Pulse running on your machine. Layout and rules: `docs/ARCHITECTURE.md`; commands for checks, builds and tests: `CLAUDE.md` (Commands).

## Run the server in under 10 minutes

You need Node 24 with Corepack, Git, and Docker (Docker Desktop, or Docker Engine with the Compose v2 plugin). Docker is needed only for the dev services below, but since T1.1 `pnpm verify` (and the `auto-commit` gate) needs their PostgreSQL running, because the server's integration tests use a real database: run `pnpm dev:up` first (see Integration tests below; `PULSE_SKIP_DB_TESTS=1` skips them locally with a warning and must never be used for a commit). CI starts its own PostgreSQL service container and never calls the dev scripts. The desktop and Android toolchains are not needed for server work (they are listed in `CLAUDE.md`).

```bash
corepack enable                      # once: provides the pinned pnpm
pnpm install --frozen-lockfile       # time depends on your network and the pnpm cache
pnpm dev                             # services + seeds + server, in this terminal
```

`pnpm dev` is the one command. It runs, in order:

1. `pnpm dev:up`: checks Docker and the host ports, starts PostgreSQL and Mailpit and waits until both report healthy.
2. The seed files (`pnpm --filter @pulse/server seed`) against that database.
3. The NestJS server in the foreground (`pnpm --filter @pulse/server dev`, on http://localhost:3000; a cold `nest start` took about 40 s when measured, later starts are faster). Ctrl+C stops the server; the services keep running until `pnpm dev:down`. Stopping with Ctrl+C is not yet verified on Linux and macOS; if the server is still running afterwards, stop it by hand.

It gives the seed step and the server the settings printed by `dev:up` (`DATABASE_URL`, and `SMTP_HOST` and `SMTP_PORT` for the server), taken from the ports in use, so a changed port needs no `export`, plus a fresh random `JWT_SECRET` and `REFRESH_SECRET` (the server refuses to start without strong ones, see Server configuration; set both in your shell to keep them across runs). A `DATABASE_URL` already set in your shell is ignored by `pnpm dev`. If the services or the seed step fail, the server is not started and the command exits non-zero.

Check the server with `curl http://localhost:3000/health` (`GET /` is a 404). `/health` runs a real query: `{"status":"ok","database":"up"}`, or 503 `UNAVAILABLE` when PostgreSQL does not answer within 2 s (`/health/live` only says the process is up). The server validates its configuration first (see Server configuration) and applies the database migrations before it listens (see Database and migrations). It reads `SMTP_HOST` and `SMTP_PORT` into its mail settings; nothing sends email before the auth tasks.

Start Docker first: `pnpm dev` stops with a clear message when the daemon is not running, or when one of the host ports (5432, 1025, 8025) is already taken; see Changing the ports. The first run pulls two small images, which is most of the wait. The commands work the same in Git Bash, PowerShell and Linux shells.

### The same in separate steps

Use these to keep the services running while you restart the server, or to run the server yourself:

```bash
pnpm dev:up                          # starts PostgreSQL and Mailpit, waits until healthy
pnpm dev:seed                        # applies the seed files (see Seed data)
pnpm --filter @pulse/server dev      # the server
```

Run them in this order. `pnpm dev:up` returns only when both services report healthy, so after it finishes the database accepts connections and `pnpm dev:seed` works. The server needs `DATABASE_URL`, `JWT_SECRET` and `REFRESH_SECRET` in its shell (`dev:up` prints the first; Server configuration shows how to make secrets); `pnpm dev` sets all three for you.

## Dev services

`infra/docker-compose.dev.yml` (project name `pulse-dev`) runs two containers. Every port is published on `127.0.0.1` only, so nothing is reachable from your network.

| Service    | Address                                          | Notes                                                   |
| ---------- | ------------------------------------------------ | ------------------------------------------------------- |
| PostgreSQL | `postgres://pulse:pulse@localhost:5432/pulse`    | Data on the named volume `pulse-dev_db-data`            |
| Mailpit    | SMTP `localhost:1025`, inbox `http://localhost:8025` | No auth, no TLS; messages live in memory only       |

Server settings for them (names from the spec's Appendix A): `DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`. Running the server by hand also needs `JWT_SECRET` and `REFRESH_SECRET` (see Server configuration); the dev password `pulse` is never accepted for those. The server now sends mail (T1.4): the four emails (verification, password reset, email change, account deleted) show up in the Mailpit inbox with a plain text and an HTML part, and the link in each is `PUBLIC_API_URL` plus a path and token (docs/ARCHITECTURE.md, "Email links"). No `SMTP_USER` or `SMTP_APP_PASSWORD` is needed for Mailpit; if you set them, the server insists on an encrypted connection (implicit TLS on port 465, otherwise STARTTLS) and refuses to log in over plain SMTP, so they do not work against Mailpit. With neither `SMTP_HOST` nor the login set, mail is off: the server says so in its log and every send reports "not configured". A failed send is logged with its reason (connection, timeout, tls, authentication, rejected) and never with the address, link or message.

| Command          | Does                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| `pnpm dev`       | `dev:up`, then the seed files, then the server in the foreground; stops before the server if either step fails |
| `pnpm dev:up`    | Checks the host ports are free, starts the services, waits for their health checks (up to 2 min), prints the URLs and settings |
| `pnpm dev:down`  | Stops them; the database is kept, the Mailpit inbox is emptied             |
| `pnpm dev:reset` | Stops them and deletes the database volume; `pnpm dev:up` then gives a fresh, empty database |
| `pnpm dev:seed`  | Applies the seed files to the dev database (see below)                     |

These credentials are public and for development only. They are not defaults for `infra/.env.example` or any deployment; a deployment must set its own strong secrets.

## Server configuration

The server reads its settings from environment variables (spec Appendix A, OPS-03), validates all of them once at start and refuses to start on a bad value: it prints every problem in one message and exits with code 1, never printing a secret. The code is `apps/server/src/platform/config/`; `loadConfig(env)` is a pure function and its table tests list the rules.

| Variable | Rule | Default |
| --- | --- | --- |
| `PORT` | whole number 0 to 65535 | 3000 |
| `DATABASE_URL` | `postgres://user:password@host:5432/database`; required (the Docker deployment fills it in for the bundled database) | none |
| `JWT_SECRET`, `REFRESH_SECRET` | required, at least 32 characters, no placeholder, different from each other | none |
| `DB_PASSWORD` | optional here (it belongs to the bundled database); at least 12 characters and no placeholder when set | none |
| `PUBLIC_API_URL` | http(s) address without credentials; used in email links | `http://localhost:<PORT>` |
| `DOMAIN` | host name only | none |
| `CORS_ORIGINS` | comma-separated exact origins (`https://app.example.org`); no `*`, no paths | empty: no cross-origin access |
| `TRUST_PROXY` | number of reverse proxies in front of the server, 0 to 32 | 0 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional; both or neither | Google sign-in off |
| `SMTP_USER`, `SMTP_APP_PASSWORD` | optional; both or neither (Gmail app password) | none |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | mail is on when the user and password, or `SMTP_HOST`, are set (a catcher like Mailpit needs no login); `SMTP_HOST` and `SMTP_PORT` default to `smtp.gmail.com` and 465; `MAIL_FROM` defaults to `SMTP_USER`, else `pulse@localhost` | mail off |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | optional; all three or none (D-23); the key may be written on one line with a backslash and n (`\n`) for each newline | push off |

An empty variable counts as unset (Compose passes empty values). Weak means too short, starting or ending with whitespace, too few different characters, or a placeholder such as `changeme`, `your-secret-here`, `secret`, `password`, `example`, `default` or a run like `123456`. Make a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`CORS_ORIGINS` matters only for browsers; the desktop and Android clients are not subject to it. For `pnpm --filter @pulse/desktop dev` in a browser add `http://localhost:1420`. Behind Caddy or another reverse proxy set `TRUST_PROXY=1`: without it the server ignores `X-Forwarded-*` headers, so a client cannot choose the address the server sees.

Timeouts and limits are fixed in code, not variables (`DEFAULT_RUNTIME_LIMITS` in `platform/config/app-config.ts`): a request that runs longer than 30 s is answered 503 `UNAVAILABLE` (the handler is not cancelled, which is safe for commands because replays carry the same command ID); PostgreSQL cancels a statement after 15 s (migrations are exempt) and a new connection must succeed within 5 s; `/health` waits 2 s for the database; on SIGTERM or SIGINT the server stops listening, closes idle connections, gives open requests at most 6 s and then closes the rest, and the database pool closes with whatever is left of one 8 s budget for the whole shutdown (less than the 10 s Docker waits). Requests Node rejects before routing (malformed request line, oversized header, a request that never completes) get the same JSON error body and request ID as any other error, with status 400 `VALIDATION` or, for a timeout, 503 `UNAVAILABLE`.

### Logs

One JSON object per line on stdout (errors on stderr): `time`, `level`, `context`, `message` and, inside a request, `requestId` (also sent as the `Pulse-Request-Id` response header and in every error body) and `userId` once authentication knows it. Each request writes one line (method, matched route pattern, status, duration; `warn` for 5xx) and never its URL, query, headers or body; successful health checks are not logged. Unhandled errors log their class, code (for example the PostgreSQL SQLSTATE) and stack frames under the same request ID, never the error message, because driver and validation messages can quote user values; the client only gets `INTERNAL`. Structured log calls keep only the access-line fields. Search a problem report by request ID: `docker compose logs | grep <id>` (the deployment's service names come with T1.3). Code that logs must pass IDs and counts only, never emails, names, titles or tokens (OPS-04); to use the user ID call `setLogUser(id)` from `platform/logging`.

## Database and migrations

The schema is created and changed only by versioned raw-SQL migrations in `apps/server/src/platform/database/migrations/`: `NNNN-name.up.sql` and `NNNN-name.down.sql`, numbered from 0001 without gaps. The server applies pending ones on every start, before it listens, and stops with the error when one fails (a failed migration rolls back completely). Several servers starting at once are safe: an advisory lock makes them queue, and each migration runs once. Never edit a migration that has been applied anywhere; add a new one (the runner refuses to start when an applied migration changed, or when the database holds a migration this version of the server does not know).

The runner keeps its bookkeeping in the table `schema_migrations`. Rolling back the last migration drops that table too, so a full rollback leaves a database that only the server migrated completely empty. `dev_seeds` (see Seed data) belongs to the seed runner and is not touched.

Rolling back by hand is a code-level call (`migrate(db, 'down')` from `platform/database/migrator.ts`, optionally `{ steps: 1 }`); there is no command for it. For the dev database the usual way back to a clean state is `pnpm dev:reset`.

### Integration tests

`pnpm --filter @pulse/server test` includes tests that need a real PostgreSQL (migrations, schema constraints, server start). Each test file creates its own throwaway database `pulse_test_<random>` on the server named by `PULSE_TEST_DATABASE_URL` (default `postgres://pulse:pulse@localhost:5432/postgres`, which is the dev database server from `pnpm dev:up`) and drops it afterwards; the dev `pulse` database is never touched. The host must be local. Start the services first (`pnpm dev:up`); with another database port set the variable, for example `PULSE_TEST_DATABASE_URL=postgres://pulse:pulse@localhost:15432/postgres`. When PostgreSQL is not reachable the tests fail and say so. `PULSE_SKIP_DB_TESTS=1` skips them knowingly (the run prints a warning); do not commit with it set. A test run killed halfway can leave a `pulse_test_*` database behind; drop it with `drop database <name> with (force)`.

## Changing the ports

The three host ports can be changed with environment variables read by `pnpm dev` and `pnpm dev:up` (values 1 to 65535, all different; anything else exits with code 2 and a message):

| Variable                 | Default | Service              |
| ------------------------ | ------- | -------------------- |
| `PULSE_DEV_DB_PORT`      | 5432    | PostgreSQL           |
| `PULSE_DEV_SMTP_PORT`    | 1025    | Mailpit SMTP         |
| `PULSE_DEV_MAIL_UI_PORT` | 8025    | Mailpit inbox in the browser |

```bash
PULSE_DEV_DB_PORT=5433 pnpm dev                 # Git Bash, Linux
```

```powershell
$env:PULSE_DEV_DB_PORT = 5433; pnpm dev         # PowerShell (stays set in that window)
```

`dev:up` prints the ports in use and the matching `DATABASE_URL`, `SMTP_HOST` and `SMTP_PORT`. Give the server and `pnpm dev:seed` those values: the seed runner does not read the `PULSE_DEV_*` variables and defaults to the 5432 URL, which on a machine with its own PostgreSQL is not the dev database. `pnpm dev` does this for you. When you run `pnpm dev:seed` or the server yourself with a changed database port, set `DATABASE_URL` in the same shell first:

```bash
export DATABASE_URL=postgres://pulse:pulse@localhost:5433/pulse
pnpm dev:seed
```

```powershell
$env:DATABASE_URL = 'postgres://pulse:pulse@localhost:5433/pulse'
pnpm dev:seed
```

`dev:down` and `dev:reset` need no variables. If you change a port while the services run, `pnpm dev:down` first, then `pnpm dev:up` with the new value (`dev:up` does not notice that a running container holds the old port and Compose then fails to recreate it). Ports stay bound to `127.0.0.1`.

## Seed data

`pnpm dev:seed` runs `pnpm --filter @pulse/server seed`: it applies `apps/server/seed/NNN-name.sql` and `.ts` files in name order to the dev database, records what it applied (table `dev_seeds`, created by the runner) so a rerun skips them, and refuses to run against a database that is not local or when `NODE_ENV=production`. Run `pnpm dev:up` first: with the database down, `pnpm dev:seed` fails with exit code 1 and says it could not connect, naming the host and port. The runner exists first and there are no seed files yet; later tasks add the demo user and sessions as new numbered files. The schema is created by the server's start-up migrations (T1.1), not by the seed runner, so a seed file that writes to a table needs the server to have started once against that database first (`pnpm dev` seeds before it starts the server; the order is revisited with the first seed that needs tables).

## Troubleshooting

- **"The Docker daemon is not running"**: start Docker Desktop, wait for it to say it is running, rerun.
- **"a host port is taken"**: `pnpm dev:up` checks the ports before starting and names the busy one and its variable. A local PostgreSQL on 5432 is the usual cause (check with `netstat -ano | findstr :5432` on Windows, `ss -ltnp | grep 5432` on Linux). Either stop that service or choose another port as in Changing the ports. On Windows a port can also be refused because a connection holds it or the range is reserved by Hyper-V (`netsh int ipv4 show excludedportrange protocol=tcp`); pick another port then too.
- **`pnpm dev:seed` says it could not connect to a host and port**: the database is not reachable. Run `pnpm dev:up` and wait for it to finish, and make `DATABASE_URL` match the ports it printed.
- **A container stays unhealthy**: `docker compose -f infra/docker-compose.dev.yml logs`.
- **Start over**: `pnpm dev:reset`, then `pnpm dev:up`.
