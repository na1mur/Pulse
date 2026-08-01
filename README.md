# Pulse

A cross-platform productivity timer for **Windows** and **Android**. Track focused work time with a single play/pause control, daily/weekly/monthly goals, statistics, and seamless sync across your devices — even when you're offline.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **One-tap timer** — Start and pause with a single control; the timer runs locally for accuracy
- **Offline-first** — Sessions are saved on-device and synced when you're back online
- **Cross-device sync** — Real-time updates via WebSocket when you switch between desktop and phone
- **Goals** — Daily, weekly, and monthly targets with progress tracking
- **Statistics** — Charts for the last 7 days, 30 days, and 12 months; streaks and averages
- **Session titles** — Label what you're working on
- **Dark mode** — System-aware theming on both platforms
- **Desktop extras** — System tray, launch at login, minimize to tray on close
- **Self-hostable** — Run your own backend; your data stays on your infrastructure

## Screenshots

> Pre-built installers are available on the [Releases](https://github.com/mohammad-naimur-rahman/Pulse/releases) page.

## Quick start (users)

1. Download the latest **Windows installer** or **Android APK** from [Releases](https://github.com/mohammad-naimur-rahman/Pulse/releases).
2. Install and open the app.
3. Create an account and start tracking.

The official builds connect to the hosted API. To use your own server, see [Self-hosting](docs/SELF_HOSTING.md).

## Quick start (developers)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 10
- [MongoDB](https://www.mongodb.com/) 6+ (local or Atlas)

### Install and run

```sh
git clone https://github.com/mohammad-naimur-rahman/Pulse.git
cd Pulse
pnpm install
```

Copy environment files and adjust as needed:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/desktop/.env.example apps/desktop/.env.development
cp apps/mobile/.env.example apps/mobile/.env.development
```

Start the API and clients (each in its own terminal):

```sh
# API (port 3001)
pnpm --filter api dev

# Desktop (Electron + Vite)
pnpm --filter desktop dev

# Mobile (Expo)
pnpm --filter mobile dev
```

Point the clients at your API by setting `VITE_API_URL` (desktop) or `EXPO_PUBLIC_API_URL` (mobile) in the env files above.

## Repository structure

```
apps/
  api/        # Node.js + Express + MongoDB backend
  desktop/    # Electron + React + Vite (Windows)
  mobile/     # React Native + Expo (Android)

packages/
  api-client/   # Shared HTTP client
  queries/      # Shared React Query hooks
  types/        # Shared TypeScript types
  utils/        # Shared utilities (timer math, formatting)
  validation/   # Shared Zod schemas
```

## Building for release

### Windows desktop

```sh
pnpm desktop:build:win
```

Output: `apps/desktop/release/Pulse Setup <version>.exe`

Set `VITE_API_URL` in `apps/desktop/.env.production` before building, or the build script defaults to the hosted API.

### Android APK

```sh
pnpm mobile:build:android
```

Output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.production` before building.

### Install APK via USB (optional)

```sh
pnpm mobile:install:android
pnpm mobile:log:android   # view device logs
```

## Self-hosting

Run your own backend so accounts and session data live on your server. See the full guide:

- **[Self-hosting guide](docs/SELF_HOSTING.md)** — with and without Docker, reverse proxy, and client configuration

## Documentation

| Document                                        | Description                      |
| ----------------------------------------------- | -------------------------------- |
| [Self-hosting](docs/SELF_HOSTING.md)            | Deploy the API and MongoDB       |
| [Contributing](CONTRIBUTING.md)                 | How to contribute                |
| [Release checklist](docs/RELEASE.md)            | Building and publishing releases |
| [Architecture](docs/high_level_architecture.md) | Design overview                  |
| [API app](apps/api/README.md)                   | Backend development              |
| [Desktop app](apps/desktop/README.md)           | Electron app development         |
| [Mobile app](apps/mobile/README.md)             | Expo / Android development       |

## Tech stack

| Layer    | Technologies                                                        |
| -------- | ------------------------------------------------------------------- |
| Monorepo | Turborepo, pnpm workspaces                                          |
| Backend  | Node.js, Express, MongoDB, Socket.IO, JWT                           |
| Desktop  | Electron, React, Vite, Zustand, TanStack Query, Tailwind, shadcn/ui |
| Mobile   | React Native, Expo, NativeWind, Zustand, TanStack Query             |
| Shared   | TypeScript, Zod, Axios                                              |

## License

[MIT](LICENSE) — Copyright (c) 2026 Mohammad Naimur Rahman
