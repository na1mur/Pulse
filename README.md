# Pulse

A work-hours tracker for individuals: one timer per user, synced live across that user's devices
(Windows desktop and Android), self-hostable and usable offline. Productive time earns credits;
leisure spends them. The server is a NestJS service with PostgreSQL, shipped as a Docker Compose
stack.

- Running your own server: this page.
- Working on Pulse: [CLAUDE.md](CLAUDE.md) (commands), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (run it locally),
  [docs/REBUILD_SPEC.md](docs/REBUILD_SPEC.md) (what it must do).
- Deployment details, settings and troubleshooting: [docs/operations/deployment.md](docs/operations/deployment.md).

## Run your own server

### What you need

- A Linux machine you control (a small VPS or an EC2 instance is enough) with **Docker Engine and the
  Compose plugin v2.20 or newer** (`docker compose version`) and **git**.
- Internet access from that machine: the first start downloads base images and builds the server
  image from this repository, which takes a few minutes.
- For HTTPS: a domain name whose DNS record points at the machine, and ports 80 and 443 open to the
  internet. The Windows and Android apps need HTTPS and WSS outside a test setup.

### First deploy

All commands run on the server, in the `infra` folder of the repository.

```bash
git clone https://github.com/na1mur/Pulse.git
cd Pulse/infra
cp .env.example .env
```

Fill in the secrets. The three commands write random values into `.env`; nothing else is needed for
a first start with the bundled database:

```bash
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^REFRESH_SECRET=.*|REFRESH_SECRET=$(openssl rand -hex 32)|" .env
```

Set `PUBLIC_API_URL` in `.env` to the address the apps will use (for a test on the machine itself,
the default `http://localhost:3000` is fine; with a domain see HTTPS below). Keep `.env` private:
it holds your secrets and is never committed. Then start everything:

```bash
docker compose up -d
```

The first run builds the server image and pulls PostgreSQL, so it takes a few minutes. The server
waits for the database, applies the database migrations and starts listening. Check it:

```bash
docker compose ps                       # server and db both "healthy"
curl http://127.0.0.1:3000/health       # {"status":"ok","database":"up"}
docker compose logs server              # one JSON object per line
```

`/health` answers 503 when the database cannot be reached. The server's port is published on this
machine only (127.0.0.1); the way in from outside is the HTTPS setup below or your own reverse
proxy. The database is not published at all: only the server can reach it, on the Compose network.
Data lives in the Docker volume `pulse_db-data` and survives `docker compose down` and reboots
(the containers restart by themselves; `docker compose down --volumes` is the command that deletes
the data).

### HTTPS with your domain

Caddy gets and renews a certificate by itself and forwards WebSocket connections (the realtime
channel) to the server.

1. Create the DNS record for your domain (for example `pulse.example.org`) pointing at the machine and
   open ports 80 and 443.
2. In `.env` set:

   ```
   COMPOSE_PROFILES=db,https
   DOMAIN=pulse.example.org
   PUBLIC_API_URL=https://pulse.example.org
   TRUST_PROXY=1
   ```

3. `docker compose up -d`, then `curl https://pulse.example.org/health`.

`TRUST_PROXY=1` tells the server that exactly one proxy (Caddy) sits in front of it, so it takes the
client address from the proxy. Keep the `caddy-data` volume: it holds the certificates. Without a
domain you can still put your own reverse proxy in front of `127.0.0.1:3000`; set `TRUST_PROXY=1`
for it too.

### Using an external database

Use a PostgreSQL you run elsewhere (a managed service, another server) instead of the bundled one:

1. In `.env` set `DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE` (a password with special
   characters must be percent-encoded) and remove `db` from `COMPOSE_PROFILES` (leave it empty, or
   `COMPOSE_PROFILES=https`). `DB_PASSWORD` is not needed then.
2. `docker compose up -d`. The server creates and updates its own tables when it starts, so the
   database user needs the right to create tables in that database.

The database must be reachable from the server's container; `localhost` inside the container is the
container itself, not your machine. Backups of an external database are yours to take with the
tools of that database.

### Updating to a new version

```bash
cd Pulse
git pull
cd infra
docker compose up -d --build
```

Compose rebuilds the image and recreates the server only if it changed; the database keeps running
and keeps its data. The new server applies its database migrations on start. Take a backup first
(next section): migrations only go forward, so going back to an older version means restoring a
backup taken before the update.

### Backup and restore of the bundled database

A backup is a plain SQL dump of the database. Take one regularly and copy it off the machine.

```bash
cd Pulse/infra
docker compose exec -T db pg_dump -U pulse -d pulse --clean --if-exists --no-owner \
  | gzip > pulse-backup-$(date +%F).sql.gz
```

Restore it into the same machine (this replaces the current data) or into a new one. On a new
machine do the first deploy up to the `.env` step (use the old `.env`, it holds the secrets your
users' devices are signed in with), then:

```bash
docker compose up -d --wait db         # only the database, wait until it is healthy
docker compose stop server             # (only when restoring on a machine that is running)
gunzip -c pulse-backup-2026-10-27.sql.gz \
  | docker compose exec -T db psql -U pulse -d pulse -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null
docker compose up -d                   # start the server again
```

The restore runs in one transaction: if anything fails nothing changes. Check with
`curl http://127.0.0.1:3000/health` and by signing in. Restore with the same PostgreSQL version that
made the dump (the bundled `postgres:17-alpine` does both when you use the commands above).

Also keep a copy of `.env` somewhere safe, apart from the database backups: without
`JWT_SECRET` and `REFRESH_SECRET` every device has to sign in again.

### Changing the database password

`DB_PASSWORD` is used once, when the database volume is created. To change it later, change it in the
database first, then in `.env`:

```bash
NEW=$(openssl rand -hex 24)
docker compose exec -T db psql -U pulse -d pulse -c "ALTER USER pulse PASSWORD '$NEW'"
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$NEW|" .env
docker compose up -d
```

### Stopping and removing

```bash
docker compose stop                    # stop, keep everything
docker compose down                    # remove containers, keep the data volume
docker compose down --volumes          # also delete the database and certificates: gone for good
```

## Building the desktop installer and the Android APK

Written with the release tasks (spec T7.6 and T7.7); the build prerequisites are already in
[CLAUDE.md](CLAUDE.md).
