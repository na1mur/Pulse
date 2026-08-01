# Self-hosting Pulse

This guide explains how to run your own Pulse backend so you control your data. After the API is running, point the desktop and mobile apps at your server URL.

## Overview

Pulse needs two services:

| Service     | Purpose                                       |
| ----------- | --------------------------------------------- |
| **MongoDB** | User accounts, work sessions, daily stats     |
| **API**     | REST + WebSocket server (Express + Socket.IO) |

The desktop and mobile apps are clients — they connect to your API over HTTPS (or HTTP for local development).

### Choose a setup

| Setup                              | MongoDB               | API             | Best for                                         |
| ---------------------------------- | --------------------- | --------------- | ------------------------------------------------ |
| **A1** — Docker (bundled)          | Docker container      | Docker          | Quickest start, everything on one machine        |
| **A2** — Docker + your MongoDB URL | Atlas / your server   | Docker          | You already have MongoDB, or prefer a managed DB |
| **B** — Manual (no Docker)         | Atlas / local install | Node.js on host | Full control without Docker                      |

---

## Option A — Docker Compose (recommended)

The fastest way to get started. Requires [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/).

You can either run **MongoDB inside Docker** (default) or point the API at **your own MongoDB URL** (Atlas, an existing server, etc.).

### A1 — Bundled MongoDB (default)

MongoDB and the API run together in Docker. No external database needed.

#### 1. Clone the repository

```sh
git clone https://github.com/mohammad-naimur-rahman/Pulse.git
cd Pulse
```

#### 2. Configure environment

Copy the example env file and edit the secrets:

```sh
cp .env.docker.example .env
```

Edit `.env` and set strong values for `JWT_SECRET` and `JWT_REFRESH_SECRET` (at least 8 characters each).

#### 3. Start services

```sh
docker compose up -d
```

This starts:

- **MongoDB** on the internal Docker network (not exposed to the host by default)
- **API** on port `3001`

Verify the API is healthy:

```sh
curl http://localhost:3001/health
# {"status":"OK","timestamp":"..."}
```

#### 4. Stop services

```sh
docker compose down
```

To remove data volumes as well:

```sh
docker compose down -v
```

---

### A2 — Your own MongoDB URL (Docker API only)

Use this if you already have MongoDB — for example [MongoDB Atlas](https://www.mongodb.com/atlas), a VPS, or a managed database. Only the **API** runs in Docker; it connects to your database over the network.

#### 1. Clone and configure

```sh
git clone https://github.com/mohammad-naimur-rahman/Pulse.git
cd Pulse
cp .env.docker.example .env
```

Edit `.env` and set:

```env
API_PORT=3001
JWT_SECRET=your-long-random-secret
JWT_REFRESH_SECRET=your-other-long-random-secret
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/pulse
```

`MONGODB_URI` must start with `mongodb://` or `mongodb+srv://`.

**MongoDB Atlas tips:**

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user and copy the connection string.
3. Replace `<password>` with your user's password and set the database name (e.g. `pulse`).
4. Under **Network Access**, allow your server's IP (or `0.0.0.0/0` for testing only).

**Self-hosted MongoDB example:**

```env
MONGODB_URI=mongodb://pulseuser:secret@db.example.com:27017/pulse
```

#### 2. Start the API

```sh
docker compose -f docker-compose.api-only.yml up -d
```

Verify:

```sh
curl http://localhost:3001/health
```

#### 3. Stop the API

```sh
docker compose -f docker-compose.api-only.yml down
```

Your data stays in your MongoDB instance — stopping the container does not delete it.

---

### Production with Docker

For a public deployment:

1. Put a reverse proxy (nginx, Caddy, Traefik) in front of the API with **HTTPS**.
2. Do **not** expose MongoDB to the internet.
3. Use strong `JWT_SECRET` and `JWT_REFRESH_SECRET` values.
4. Set `NODE_ENV=production` in your `.env`.
5. Consider firewall rules so only the proxy can reach port 3001.

Example Caddy reverse proxy:

```text
pulse.example.com {
    reverse_proxy localhost:3001
}
```

Socket.IO works through standard HTTP/WebSocket reverse proxies when WebSocket upgrade headers are forwarded (Caddy and nginx both handle this by default).

---

## Option B — Manual setup (no Docker)

### Prerequisites

- Node.js 18+
- pnpm 10
- MongoDB 6+ running locally or on MongoDB Atlas

### 1. Install MongoDB

**Local (Ubuntu example):**

```sh
sudo apt install mongodb
sudo systemctl start mongod
```

**MongoDB Atlas:**

Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas), then copy the connection string.

### 2. Configure the API

```sh
git clone https://github.com/mohammad-naimur-rahman/Pulse.git
cd Pulse
pnpm install

cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/pulse
# Or Atlas: mongodb+srv://user:pass@cluster.mongodb.net/pulse

JWT_SECRET=your-long-random-secret-here
JWT_REFRESH_SECRET=your-other-long-random-secret-here
NODE_ENV=production
```

Generate secrets (example):

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Build and run

**Development:**

```sh
pnpm --filter api dev
```

**Production:**

```sh
pnpm --filter api build
pnpm --filter api start
```

### 4. Process manager (optional)

Use [PM2](https://pm2.keymetrics.io/) to keep the API running:

```sh
pnpm --filter api build
pm2 start apps/api/dist/index.js --name pulse-api
pm2 save
```

### 5. Reverse proxy

Expose the API on HTTPS. Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name pulse.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Connecting clients to your server

Once your API is reachable (e.g. `https://pulse.example.com`), configure the apps:

### Desktop (development)

In `apps/desktop/.env.development` or `.env.development.local`:

```env
VITE_API_URL=https://pulse.example.com
```

Restart `pnpm --filter desktop dev` after changes.

### Desktop (release build)

In `apps/desktop/.env.production`:

```env
VITE_API_URL=https://pulse.example.com
```

Then build:

```sh
pnpm desktop:dist:win
```

### Mobile (development)

In `apps/mobile/.env.development` or `.env.local`:

```env
EXPO_PUBLIC_API_URL=https://pulse.example.com
```

Restart Expo with a clean cache: `pnpm --filter mobile dev` (or `expo start -c`).

### Mobile (release APK)

In `apps/mobile/.env.production`:

```env
EXPO_PUBLIC_API_URL=https://pulse.example.com
```

Then build:

```sh
pnpm mobile:build:android
```

---

## Environment variables reference

| Variable             | Required | Default       | Description                             |
| -------------------- | -------- | ------------- | --------------------------------------- |
| `PORT`               | No       | `3001`        | API listen port                         |
| `MONGODB_URI`        | Yes      | —             | MongoDB connection string               |
| `JWT_SECRET`         | Yes      | —             | Access token signing key (min 8 chars)  |
| `JWT_REFRESH_SECRET` | Yes      | —             | Refresh token signing key (min 8 chars) |
| `NODE_ENV`           | No       | `development` | `development`, `production`, or `test`  |

Client variables:

| Variable              | App     | Description          |
| --------------------- | ------- | -------------------- |
| `VITE_API_URL`        | Desktop | Base URL of your API |
| `EXPO_PUBLIC_API_URL` | Mobile  | Base URL of your API |

---

## Troubleshooting

### API won't start — invalid environment variables

The API validates env vars on boot. Check that `MONGODB_URI` starts with `mongodb://` or `mongodb+srv://` and that JWT secrets are at least 8 characters.

### Clients can't connect

- Confirm `curl https://your-api/health` returns `{"status":"OK"}`.
- Check CORS is not blocking you (the API allows all origins by default).
- Ensure the client env var is set and you've restarted the dev server or rebuilt the app.
- For mobile, `EXPO_PUBLIC_*` vars are baked in at build time — rebuild after changing them.

### WebSocket sync not working

- Verify your reverse proxy forwards WebSocket upgrades (`Upgrade` and `Connection` headers).
- Test with the API directly (no proxy) to isolate proxy issues.

### MongoDB connection refused (Docker, bundled MongoDB)

Wait for MongoDB to become healthy before the API starts. `docker compose up` handles this via `depends_on` with a health check. If issues persist:

```sh
docker compose logs mongo
docker compose logs api
```

### MongoDB connection refused (external URL)

- Confirm `MONGODB_URI` is set in `.env` and starts with `mongodb://` or `mongodb+srv://`.
- For Atlas, check **Network Access** allows your Docker host's public IP.
- Test the URI with `mongosh "<your-uri>"` from the same machine running Docker.
- View API logs: `docker compose -f docker-compose.api-only.yml logs api`

---

## Backups

Back up your MongoDB database regularly. For local MongoDB:

```sh
mongodump --uri="mongodb://localhost:27017/pulse" --out=./backup
```

For Atlas, use Atlas backup features or `mongodump` with your Atlas connection string.

## Security notes

- Change default JWT secrets before going to production.
- Use HTTPS in production.
- Keep MongoDB off the public internet.
- The API includes rate limiting and Helmet security headers.
- Review and restrict network access to your server as needed.
