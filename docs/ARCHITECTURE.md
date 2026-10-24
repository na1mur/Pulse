# Pulse architecture

How the code is organised, which parts may depend on which, and how each part is layered. Product rules live in `docs/REBUILD_SPEC.md` (cited by ID); this file covers structure only. Status: **accepted by the owner 2026-10-24**; made concrete by T0.2 (scaffold) and revisited when user stories add requirements. Decisions are listed at the end.

## 1. Repository layout

```
apps/
  server/          NestJS API + realtime gateway (TypeScript)
  desktop/         Tauri 2 app
    src/           Svelte 5 UI (TypeScript)
    src-tauri/     Rust shell: window, tray, OS events, trackers, Tauri commands
  android/         Gradle project: Kotlin + Jetpack Compose app, foreground service
  extension/       WXT browser extension (TypeScript)
crates/
  core/            pulse-core: domain, sync, outbox, local store (Rust library)
  core-ffi/        UniFFI bindings of pulse-core for Android
  native-host/     browser native-messaging host (small Rust binary)
  contract-types/  Rust types generated from the contract (generated/ only)
packages/
  contract/        zod schemas -> OpenAPI + JSON Schema -> generated TS client, mocks
  tokens/          design tokens source -> generated CSS variables and Compose theme
docs/              spec, architecture, FE guide, design briefs, QA reports, ADRs, knowledge
scripts/           repo tooling (docs checks, spec lookup)
```

Workspaces: pnpm (`apps/server`, `apps/desktop`, `apps/extension`, `packages/*`), Cargo (`crates/*`, `apps/desktop/src-tauri`), Gradle (`apps/android`, building `crates/core-ffi` through `cargo-ndk`).

Generated code always lives in a `generated/` folder or starts with an `@generated` comment line, is never hand-edited (the edit guard refuses it), and is rebuilt by one command per package.

## 2. Dependency rules

Arrows mean "may depend on". Anything not listed is forbidden.

```
packages/contract  <- apps/server, apps/desktop/src, apps/extension, crates/contract-types (generated from it)
packages/tokens    <- apps/desktop/src, apps/android (generated theme)
crates/contract-types <- crates/core, crates/native-host
crates/core        <- apps/desktop/src-tauri, crates/core-ffi
crates/core-ffi    <- apps/android (as a native library)
```

The browser-extension protocol (messages between the extension and the native host) is defined in `packages/contract` like everything else, so the TypeScript extension and the Rust host share one source.

- **The UI never talks to the server.** `apps/desktop/src` calls only Tauri commands and listens to Tauri events; the Rust core owns HTTP, WebSocket, the outbox and the cache (spec 8.7). Android screens likewise call the core through the service.
- **`crates/core` has no UI, Tauri, Android or OS dependency.** Clock, storage, transport, connectivity and notifications are ports (traits) implemented by adapters; tests use fakes.
- **The server never imports client code**, and clients never import server code; they meet only in `packages/contract`.
- **Features do not reach into each other.** Inside an app, a feature imports another feature only through that feature's public entry file; shared code moves to `lib/` (desktop) or `ui/` / `core/` (Android).

## 3. Layering per part

### Rust core (`crates/core`)

```
src/
  domain/     pure logic, no I/O: time math (R-10..R-18), timer reducer (R-01..R-05),
              goals/streaks (R-19..R-28), credit math (R-42..R-47), segments (R-38..R-41)
  app/        use cases: commands and queries that orchestrate domain + ports
  sync/       outbox, change feed, revisions, clock offset (spec section 8)
  ports/      traits: Clock, Store, Transport, Connectivity, Notifier
  adapters/   sqlite store, http/ws transport, system clock (behind cargo features)
  api.rs      the small public facade used by Tauri commands and UniFFI
```

`domain` depends on nothing else in the crate; `app` on `domain` and `ports`; `sync` on `app`, `domain`, `ports`; `adapters` implement `ports`; `api` wires everything.

### Desktop UI (`apps/desktop/src`)

```
app/              shell, navigation, persistent timer bar, theme bootstrap
features/<name>/  today, log, insights, goals, settings, auth, activity
                  (components, state, feature logic; entry file index.ts)
lib/ui/           design-system primitives from the FE guide's component catalogue
lib/core/         the only place that calls Tauri invoke / listens to events, typed from the contract
lib/format/       Intl-based date, duration and number formatting
```

### Desktop shell (`apps/desktop/src-tauri`)

Commands are thin: parse input, call `pulse-core`'s `api`, map errors. Platform code (tray, autostart, idle/lock/sleep, foreground tracker, notifications) lives in its own modules and feeds the core through its ports.

### Server (`apps/server`)

```
src/
  modules/<name>/   one per spec 7.2 group: auth, timer, sessions, tags, goals, preferences,
                    insights, achievements, activity, classification, credits,
                    sync (realtime + change feed), data (export/import), health
    *.controller.ts / *.gateway.ts   transport only: validate with the contract, call the service
    *.service.ts                     use case, transaction boundary, emits events
    *.repository.ts                  SQL only
  domain/           pure functions (no Nest, no database): time math, credit math, classification
  platform/         config, database, logging, errors, idempotency, revisions
```

Controllers never touch the database; repositories never contain business rules; `domain` imports nothing from Nest.

### Android (`apps/android`)

One app module at first (size budget, spec 9.3), packages:

```
core/          wrapper around the UniFFI bindings, lifecycle, service binding
service/       foreground service: hosts the core, realtime connection, trackers, notification
feature/<name>/ screen composables + ViewModel per feature
ui/            theme (generated from packages/tokens) and shared components
```

There is deliberately no Kotlin data layer (no Room, Retrofit or repositories): storage, sync and networking live in the Rust core, and `core/` is the only door to them. Split into Gradle modules only when build time or boundaries demand it.

## 4. Cross-cutting conventions

- **Errors:** one error model from the contract (spec 7.1). Rust: `thiserror` types mapped to contract codes at the boundary. Server: domain errors mapped to contract errors in one exception filter. UI: errors arrive as typed values and end in the feedback layer, never swallowed.
- **Time:** integer seconds and UTC instants everywhere; day keys only through the time-math module.
- **IDs:** client-generated UUID v7 for anything a client can create.
- **Configuration:** validated at startup (server) or at build time (clients); no secrets in the repo.
- **Tests sit next to the code** they test (`*.spec.ts`, Rust `#[cfg(test)]` modules and `tests/`, Android `src/test` and `src/androidTest`); shared fixtures (time zones, DST days) live in one place and are used by every implementation.

## 5. Enforcement (A3.3, after T0.2)

- TypeScript: dependency-cruiser rules mirroring section 2, run in CI.
- Rust: crate dependencies in `Cargo.toml` are the rule; `pulse-core` must build without Tauri or Android features.
- Kotlin: package-level rules checked in review until modules are split.
- `change-review` checks new code against this file.

## 6. Decisions

- Spec-level (decided 2026-10-24): D-19 (one shared fixture suite keeps time and credit math identical in the TypeScript server and the Rust core) and D-20 (Kysely for server data access), spec section 13.
- Structure-level ADRs (accepted 2026-10-24): `docs/decisions/0001-no-monorepo-task-runner.md`, `docs/decisions/0002-ui-primitives-inside-desktop-app.md`.
