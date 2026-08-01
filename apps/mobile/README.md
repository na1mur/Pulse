# Pulse Mobile

Android app built with **React Native**, **Expo**, and **NativeWind**.

## Prerequisites

- Node.js 18+
- pnpm 10
- [Android Studio](https://developer.android.com/studio) with SDK and emulator (or a physical device)
- A running [Pulse API](../api/README.md) (local or remote)

For USB debugging: enable Developer Options and USB debugging on your device, and install [ADB](https://developer.android.com/tools/adb).

## Setup

```sh
# From the monorepo root
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.development
```

Set your API URL in `apps/mobile/.env.development`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3001
```

For a physical device, use your machine's LAN IP instead of `localhost`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:3001
```

Env files must live in `apps/mobile/` (not the monorepo root).

## Development

```sh
pnpm --filter mobile dev
```

Scan the QR code with Expo Go, or press `a` to open on an Android emulator.

Clear cache after env changes:

```sh
cd apps/mobile && npx expo start -c
```

### Native Android build (dev)

```sh
pnpm --filter mobile android
```

## Release APK

Set the production API URL in `apps/mobile/.env.production`:

```env
EXPO_PUBLIC_API_URL=https://your-api.example.com
```

Build:

```sh
pnpm mobile:build:android
```

Output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

### Install on device via USB

```sh
pnpm mobile:install:android
```

### View device logs

```sh
pnpm mobile:log:android
```

## EAS Build (optional)

For cloud builds with [Expo Application Services](https://expo.dev/eas):

```sh
cd apps/mobile
pnpm build:android:preview    # internal APK
pnpm build:android:production   # production build
```

Configure profiles in `eas.json`. You'll need your own Expo account and project.

## Features

- Play/pause productivity timer with session titles
- Dashboard with progress, stats, and today's sessions
- Goals (daily, weekly, monthly)
- Statistics with charts
- Dark/light theme
- Background timer via Android foreground service
- Battery optimization guidance in settings
- Offline session queue with automatic sync

## Project structure

```
apps/mobile/
  app/              # Expo Router screens
  src/
    components/     # UI components and screens
    hooks/          # Timer, sync, queries
    store/          # Zustand stores
  plugins/          # Expo config plugins (foreground service)
  scripts/          # assemble-release, install-android, log-android
```

## Self-hosting

Point `EXPO_PUBLIC_API_URL` at your self-hosted API. This variable is embedded at **build time** — rebuild the APK after changing it. See [Self-hosting guide](../../docs/SELF_HOSTING.md).
