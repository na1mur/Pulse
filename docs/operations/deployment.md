# Deployment (server image and Compose)

For the person running a server, the steps are in the repository `README.md` (first deploy, HTTPS, external database, update, backup and restore). This page is the reference behind them: what each file does, why it is built that way, how it is tested and what is not tested. Spec: OPS-01, OPS-02, OPS-03, OPS-06; task T1.3 (2026-10-27).

## Files

| File | Role |
|---|---|
| `apps/server/Dockerfile` | Two stages. `build`: Node from `ARG NODE_VERSION` (must equal `.node-version`; a test checks it), pnpm from Corepack and the `packageManager` field, `pnpm install --frozen-lockfile` for the server and what it depends on, builds `@pulse/contract` and the server (`nest build` copies the SQL migrations next to the code), then `pnpm deploy --legacy --prod` for a production-only copy. `runtime`: the same Node on Alpine, only `dist`, `node_modules` and `package.json`, owned by root, run as the image's `node` user (uid 1000), `HEALTHCHECK` on `/health`. |
| `.dockerignore` | An allow-list: only the workspace manifests, `apps/server` and `packages/contract` reach the build, so an `.env` or a key in the checkout cannot end up in a layer. |
| `infra/docker-compose.yml` | The deployment: `server`, `db` (profile `db`), `caddy` (profile `https`). |
| `infra/Caddyfile` | Caddy for `DOMAIN`: reverse proxy to `server:$PORT`, which passes WebSocket upgrades (`/v1/sync/stream`) through. |
| `infra/.env.example` | The template for `infra/.env`. |
| `scripts/deploy-smoke.mjs` | The smoke test, run by the `deploy` job in `.github/workflows/ci.yml` and by hand. |

The development stack (`infra/docker-compose.dev.yml`) shares nothing with these.

## How the switches work

- **Bundled or external database.** The profile `db` (set through `COMPOSE_PROFILES` in `.env`, because plain `docker compose up -d` takes no flags) starts PostgreSQL. The server's `DATABASE_URL` is `${DATABASE_URL}` when set, else `postgres://pulse:${DB_PASSWORD}@db:5432/pulse`; the second form refuses to start Compose without `DB_PASSWORD`. The server waits for the database through `depends_on` with `required: false`, so with the profile off nothing waits. If `DATABASE_URL` is empty and the profile is off, the server cannot resolve `db` and stops with the "database unreachable" message.
- **Passwords inside a URL.** Compose cannot percent-encode, so `DB_PASSWORD` must be URL-safe; the generators in the README (hex) are. The server itself refuses a `DB_PASSWORD` shorter than 12 characters or a placeholder (OPS-03).
- **HTTPS.** Profile `https` starts Caddy on 80, 443 and 443/udp. The server's own port stays on `127.0.0.1` (`PULSE_BIND_ADDRESS` changes that for tests). `TRUST_PROXY` must be 1 behind Caddy; it is not derived automatically.
- **`PORT`** sets the port inside the container and on the host, so the health check, the published port and Caddy's upstream follow it.
- **Secrets** come from `.env` through Compose interpolation. They are visible with `docker inspect` to anyone who can use the Docker socket, which is root-equivalent anyway.

## Hardening in the Compose file

The server runs with a read-only root file system (a `tmpfs` on `/tmp`), no Linux capabilities and `no-new-privileges`; PostgreSQL keeps only the capabilities its entrypoint needs to drop root and own the data directory; Caddy keeps `NET_BIND_SERVICE`. `restart: unless-stopped` on all services, `stop_grace_period: 10s` for the server (its shutdown budget is 8 s), 30 s for PostgreSQL. Container logs rotate at 3 files of 10 MB. The server exits with code 143 after a graceful stop: Nest re-raises SIGTERM once it has closed everything; that is normal.

## Smoke test

`node scripts/deploy-smoke.mjs` (needs Docker with Compose v2.24 or newer; CI: job `deploy`, a few minutes when the image is built cold). It uses a throwaway project name, a temporary env file with generated secrets, free loopback ports and a uniquely tagged image, never reads `infra/.env`, and removes containers, volumes, networks and the image it created, also on failure. It proves, in order:

1. the Compose file renders for the profile combinations `db`, `db,https`, `https` and none, and `caddy validate` accepts the Caddyfile;
2. `/health` answers `{"status":"ok","database":"up"}` on the bundled database;
3. the server runs as a non-root user and cannot write to `/app`; the database publishes no host port;
4. a row survives `down` and `up`, and the second start reports an up-to-date schema (migrations are idempotent);
5. a `pg_dump` taken from the running database restores into a brand-new empty volume, and the server then finds the schema up to date;
6. with the `https` profile on the domain `localhost`, Caddy answers over HTTPS with its own certificate, proxies `/health`, and redirects HTTP to HTTPS;
7. with `DATABASE_URL` set to a second PostgreSQL container and the profile off, only the server runs, it migrates that database and is healthy.

The pure parts (secret and env-file generation, health parsing, waiting with a fake clock, the Compose overrides) and the agreement between the files (Node version, the variables Compose reads against the template and spec Appendix A, no published database port, the `.dockerignore` rules) are tested in `scripts/deploy-smoke.test.mjs`, which runs in `node scripts/check.mjs --only docs`.

Not covered: certificate issuance from Let's Encrypt (needs a public domain), the WebSocket upgrade through Caddy (the server has no WebSocket endpoint yet; `reverse_proxy` passes upgrades by design, re-check when the sync gateway lands, T3.x), a real clean VM, and `linux/arm64`.

## Troubleshooting

- `required variable ... is missing a value` from `docker compose`: the named line in `.env` is empty.
- The server container restarts and logs a configuration problem: the server lists every wrong value (never the secrets). Fix `.env`, `docker compose up -d`.
- Server logs "database unreachable": with the bundled database check `docker compose ps` (db healthy?) and that `COMPOSE_PROFILES` contains `db`; with an external one check that the host name resolves and is reachable from the container, and the firewall.
- `/health` answers 503: the database does not answer within 2 s; the container shows "unhealthy" but is not restarted (nothing in the stack acts on it).
- Caddy exits with "DOMAIN is not set": add `DOMAIN` to `.env`. Certificate errors: the DNS record must point at this machine and ports 80 and 443 must be reachable; `docker compose logs caddy`.
- Changed `DB_PASSWORD` in `.env` and the server cannot log in: the database keeps its old password; use the steps in the README ("Changing the database password").
- Start over (deletes the data): `docker compose down --volumes`.

## Pinned versions

Node `24.15.0` (Dockerfile ARG and `.node-version`), pnpm from `package.json`, `postgres:17-alpine` (the major is pinned; minor updates arrive with a pull), `caddy:2.11-alpine`. Base images are tags, not digests: a rebuild picks up patched Alpine and Node layers of the same version on purpose; pin digests if you want bit-for-bit repeatable images.
