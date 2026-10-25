# Development guide

How to get Pulse running on your machine. Layout and rules: `docs/ARCHITECTURE.md`; commands for checks, builds and tests: `CLAUDE.md` (Commands).

## Run the server in under 10 minutes

You need Node 24 with Corepack, Git, and Docker (Docker Desktop, or Docker Engine with the Compose v2 plugin). Docker is needed only for the dev services below; `pnpm verify` and CI never use it. The desktop and Android toolchains are not needed for server work (they are listed in `CLAUDE.md`).

```bash
corepack enable                      # once: provides the pinned pnpm
pnpm install --frozen-lockfile       # time depends on your network and the pnpm cache
pnpm dev                             # services + seeds + server, in this terminal
```

`pnpm dev` is the one command. It runs, in order:

1. `pnpm dev:up`: checks Docker and the host ports, starts PostgreSQL and Mailpit and waits until both report healthy.
2. The seed files (`pnpm --filter @pulse/server seed`) against that database.
3. The NestJS server in the foreground (`pnpm --filter @pulse/server dev`, on http://localhost:3000; a cold `nest start` took about 40 s when measured, later starts are faster). Ctrl+C stops the server; the services keep running until `pnpm dev:down`. Stopping with Ctrl+C is not yet verified on Linux and macOS; if the server is still running afterwards, stop it by hand.

It gives the seed step and the server the settings printed by `dev:up` (`DATABASE_URL`, and `SMTP_HOST` and `SMTP_PORT` for the server), taken from the ports in use, so a changed port needs no `export`. A `DATABASE_URL` already set in your shell is ignored by `pnpm dev`. If the services or the seed step fail, the server is not started and the command exits non-zero.

Check the server with `curl http://localhost:3000/health` (`GET /` is a 404). Until T1.1 and T1.2 land the server does not use the database or read `DATABASE_URL`, `SMTP_HOST` or `SMTP_PORT`, and the `database` status in `/health` is a stub that always says `up`; the services are ready for them.

Start Docker first: `pnpm dev` stops with a clear message when the daemon is not running, or when one of the host ports (5432, 1025, 8025) is already taken; see Changing the ports. The first run pulls two small images, which is most of the wait. The commands work the same in Git Bash, PowerShell and Linux shells.

### The same in separate steps

Use these to keep the services running while you restart the server, or to run the server yourself:

```bash
pnpm dev:up                          # starts PostgreSQL and Mailpit, waits until healthy
pnpm dev:seed                        # applies the seed files (see Seed data)
pnpm --filter @pulse/server dev      # the server
```

Run them in this order. `pnpm dev:up` returns only when both services report healthy, so after it finishes the database accepts connections and `pnpm dev:seed` works.

## Dev services

`infra/docker-compose.dev.yml` (project name `pulse-dev`) runs two containers. Every port is published on `127.0.0.1` only, so nothing is reachable from your network.

| Service    | Address                                          | Notes                                                   |
| ---------- | ------------------------------------------------ | ------------------------------------------------------- |
| PostgreSQL | `postgres://pulse:pulse@localhost:5432/pulse`    | Data on the named volume `pulse-dev_db-data`            |
| Mailpit    | SMTP `localhost:1025`, inbox `http://localhost:8025` | No auth, no TLS; messages live in memory only       |

Server settings for them (names from the spec's Appendix A): `DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`. Emails the server sends (verification, password reset, ...) show up in the Mailpit inbox.

| Command          | Does                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| `pnpm dev`       | `dev:up`, then the seed files, then the server in the foreground; stops before the server if either step fails |
| `pnpm dev:up`    | Checks the host ports are free, starts the services, waits for their health checks (up to 2 min), prints the URLs and settings |
| `pnpm dev:down`  | Stops them; the database is kept, the Mailpit inbox is emptied             |
| `pnpm dev:reset` | Stops them and deletes the database volume; `pnpm dev:up` then gives a fresh, empty database |
| `pnpm dev:seed`  | Applies the seed files to the dev database (see below)                     |

These credentials are public and for development only. They are not defaults for `infra/.env.example` or any deployment; a deployment must set its own strong secrets.

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

`pnpm dev:seed` runs `pnpm --filter @pulse/server seed`: it applies `apps/server/seed/NNN-name.sql` and `.ts` files in name order to the dev database, records what it applied (table `dev_seeds`, created by the runner) so a rerun skips them, and refuses to run against a database that is not local or when `NODE_ENV=production`. Run `pnpm dev:up` first: with the database down, `pnpm dev:seed` fails with exit code 1 and says it could not connect, naming the host and port. The runner exists first; there is no schema before T1.1, so no seed files yet. T1.1 and later tasks add the demo user and sessions as new numbered files.

## Troubleshooting

- **"The Docker daemon is not running"**: start Docker Desktop, wait for it to say it is running, rerun.
- **"a host port is taken"**: `pnpm dev:up` checks the ports before starting and names the busy one and its variable. A local PostgreSQL on 5432 is the usual cause (check with `netstat -ano | findstr :5432` on Windows, `ss -ltnp | grep 5432` on Linux). Either stop that service or choose another port as in Changing the ports. On Windows a port can also be refused because a connection holds it or the range is reserved by Hyper-V (`netsh int ipv4 show excludedportrange protocol=tcp`); pick another port then too.
- **`pnpm dev:seed` says it could not connect to a host and port**: the database is not reachable. Run `pnpm dev:up` and wait for it to finish, and make `DATABASE_URL` match the ports it printed.
- **A container stays unhealthy**: `docker compose -f infra/docker-compose.dev.yml logs`.
- **Start over**: `pnpm dev:reset`, then `pnpm dev:up`.
