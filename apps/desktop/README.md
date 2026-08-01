# Pulse Desktop

Windows desktop app built with **Electron**, **React**, **Vite**, and **Tailwind CSS**.

## Prerequisites

- Node.js 18+
- pnpm 10
- A running [Pulse API](../api/README.md) (local or remote)

## Setup

```sh
# From the monorepo root
pnpm install
cp apps/desktop/.env.example apps/desktop/.env.development
```

Set your API URL in `apps/desktop/.env.development`:

```env
VITE_API_URL=http://localhost:3001
```

## Development

```sh
pnpm --filter desktop dev
```

This starts the Vite dev server and launches Electron with hot reload.

### Env file priority (dev)

Highest priority first:

1. `.env.development.local`
2. `.env.development`
3. `.env.local`
4. `.env`

Restart `pnpm dev` after changing env files.

## Production build (Windows installer)

Set the API URL for production builds in `apps/desktop/.env.production`:

```env
VITE_API_URL=https://your-api.example.com
```

Build the installer:

```sh
pnpm desktop:dist:win
```

Output: `apps/desktop/release/Pulse Setup <version>.exe`

If `.env.production` is missing, the build script defaults `VITE_API_URL` to the hosted API.

## Features

- Play/pause productivity timer with session titles
- Dashboard with today's progress, stats, and session list
- Goals page (daily, weekly, monthly targets)
- Statistics with charts
- Dark/light theme
- System tray with minimize-to-tray on close
- Launch at login
- Offline session queue with automatic sync

## Project structure

```
apps/desktop/
  electron/       # Main process, preload, desktop settings
  src/
    components/   # React UI
    hooks/        # Timer, sync, queries
    store/        # Zustand stores (timer, offline queue)
  build/icons/    # App icons for Electron Builder
  scripts/      # dist-win.mjs build script
```

## Self-hosting

Point `VITE_API_URL` at your self-hosted API. See [Self-hosting guide](../../docs/SELF_HOSTING.md).
