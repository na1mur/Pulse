# Pulse architecture

How the code is organised, which parts may depend on which, and how each part is layered. Product rules live in `docs/REBUILD_SPEC.md` (cited by ID); this file covers structure only. Status: **accepted by the owner 2026-10-24**; updated 2026-10-24 for the owner's PRD (`docs/product/PRD.md`: email, Google sign-in, push, Compose deployment, on-device activity classification, no browser extension in v1); made concrete by T0.2 (scaffold). The PRD's folder layout is indicative; this one meets its intent (one monorepo, shared rules, `infra/` for deployment). Decisions are listed at the end.

## 1. Repository layout

```
apps/
  server/          NestJS API + realtime gateway + mail + push (TypeScript)
  desktop/         Tauri 2 app
    src/           Svelte 5 UI (TypeScript)
    src-tauri/     Rust shell: windows (main, mini), tray, shortcut, OS events, trackers, Tauri commands
  android/         Gradle project: Kotlin + Jetpack Compose app, foreground service, widget
crates/
  core/            pulse-core: domain, sync, outbox, local store, tracking pipeline (Rust library)
  core-ffi/        UniFFI bindings of pulse-core for Android
  contract-types/  Rust types and client generated from the contract (src/generated/; codegen/ is the
                   generator, tests/ the cross-language conformance tests)
packages/
  contract/        zod schemas -> OpenAPI + JSON Schema -> generated TS client, mocks;
                   fixtures/ (shared time, streak and credit cases, D-19);
                   data/ (default usage rules, read by the core at build time)
  tokens/          design tokens source (incl. category colours) -> generated CSS variables and Compose theme
infra/             docker-compose.yml (server, `db` profile, `https` profile with Caddy), .env.example, Caddyfile;
                   docker-compose.dev.yml (dev-only PostgreSQL + Mailpit, T0.6)
docs/              spec, PRD, architecture, FE guide, design briefs, QA reports, ADRs, knowledge
scripts/           repo tooling: docs checks, spec lookup, the one-command check (check.mjs) and the
                   local dev environment (dev.mjs behind `pnpm dev`, `dev:up`, `dev:down`, `dev:reset`)
```

Inside `apps/server`, `scripts/seed/` is the dev seed runner and `seed/` holds the seed files (section 3). The runner sits outside `src/` so it stays out of `dist` and the production image.

Workspaces: pnpm (`apps/server`, `apps/desktop`, `packages/*`), Cargo (`crates/*`, `apps/desktop/src-tauri`), Gradle (`apps/android`, building `crates/core-ffi` through `cargo-ndk`). The browser extension and its native host (ACT-09) are P2; they would return as `apps/extension` and `crates/native-host`.

Generated code always lives in a `generated/` folder or starts with an `@generated` comment line, is never hand-edited (the edit guard refuses it), and is rebuilt by one command per package.

## 2. Dependency rules

Arrows mean "may depend on". Anything not listed is forbidden.

```
packages/contract  <- apps/server, apps/desktop/src, crates/contract-types (generated from it),
                      crates/core (fixtures in tests, data/ at build time)
packages/tokens    <- apps/desktop/src, apps/android (generated theme)
crates/contract-types <- crates/core
crates/core        <- apps/desktop/src-tauri, crates/core-ffi
crates/core-ffi    <- apps/android (as a native library)
```

- **The UI never talks to the server.** `apps/desktop/src` calls only Tauri commands and listens to Tauri events; the Rust core owns HTTP, WebSocket, the outbox and the cache (spec 8.7). Android screens likewise call the core through the service.
- **`crates/core` has no UI, Tauri, Android or OS dependency.** Clock, storage, transport, connectivity and notifications are ports (traits) implemented by adapters; tests use fakes.
- **The server never imports client code**, and clients never import server code; they meet only in `packages/contract`.
- **Features do not reach into each other.** Inside an app, a feature imports another feature only through that feature's public entry file; shared code moves to `lib/` (desktop) or `ui/` / `core/` (Android).

## 3. Layering per part

### Rust core (`crates/core`)

```
src/
  domain/     pure logic, no I/O: time math (R-10..R-18), timer reducer (R-01..R-07),
              goals/streaks (R-19..R-28), credit math (R-42..R-46),
              classification and usage increments (R-38..R-41)
  app/        use cases: commands and queries that orchestrate domain + ports
  sync/       outbox, snapshot + change feed, revisions, clock offset (spec section 8)
  tracking/   sample store (7 days), presence, accumulation into increments (spec 8.8)
  ports/      traits: Clock, Store, Transport, Connectivity, Notifier, ForegroundSource, Presence
  adapters/   sqlite store, http/ws transport (behind cargo features), system clock (std only,
              so always built)
  api.rs      the small public facade used by Tauri commands and UniFFI (since T0.5 `domain`,
              `ports`, `adapters` and the `test-support` fake clock are public too, for the
              fixture tests and other crates' tests; apps still go through `api`)
```

Each module starts as a single file (`domain.rs`) and becomes a folder when it grows. `domain` depends on nothing else in the crate; `app` on `domain` and `ports`; `sync` and `tracking` on `app`, `domain`, `ports`; `adapters` implement `ports`; `api` wires everything. Platform trackers (Windows, Android) only produce foreground samples and presence changes through the ports; classification, accumulation and everything that leaves the device happen in the core, so the privacy rule (principle 11) is enforced in one place.

### Desktop UI (`apps/desktop/src`)

```
app/              shell, navigation, persistent timer bar, session dialogs, theme bootstrap
features/<name>/  today, history, stats, settings, auth, tracking, mini
                  (components, state, feature logic; entry file index.ts)
lib/ui/           design-system primitives from the FE guide's component catalogue
lib/core/         the only place that calls Tauri invoke / listens to events, typed from the contract
lib/format/       Intl-based date, duration and number formatting
```

### Desktop shell (`apps/desktop/src-tauri`)

Commands are thin: parse input, call `pulse-core`'s `api`, map errors. Platform code (tray, autostart, global shortcut, mini window, lock/sleep, foreground tracker with UI Automation for browsers, game signals, notifications with actions, Google sign-in loopback) lives in its own modules and feeds the core through its ports.

### Server (`apps/server`)

```
src/
  modules/<name>/   one per spec 7.2 group: auth (incl. Google, email tokens), timer, sessions,
                    tags, goals, preferences, stats (incl. daily aggregates), achievements,
                    usage, credits (rates + ledger), push, sync (realtime + snapshot + change feed),
                    data (export/import), app-updates, health
  mail/             SMTP transport and templates (used by auth)
    *.controller.ts / *.gateway.ts   transport only: validate with the contract, call the service
    *.service.ts                     use case, transaction boundary, emits events
    *.repository.ts                  SQL only
  domain/           pure functions (no Nest, no database): time math, streaks, credit math and ledger
  platform/         config, database, logging, errors, http (contract validation), idempotency, revisions
                    platform/database (T1.1): Kysely provider, hand-written table types, the migration
                    runner and migrations/NNNN-name.{up,down}.sql (raw SQL, copied to dist by nest build);
                    migrations run on start before listening (src/bootstrap.ts)
                    platform/config (T1.2): `loadConfig(env)` validates every Appendix A variable once
                    (every problem in one message, no secret printed, weak secrets refused) into an
                    `AppConfig` injected as `APP_CONFIG`; only `config.module.ts` and `bootstrap.ts` read `process.env`
                    platform/logging (T1.2): JSON lines; `requestId` and `userId` come from an
                    AsyncLocalStorage context set by the request-context middleware, nothing else is
                    added automatically (OPS-04)
                    platform/http (T1.2): `configureApp` applies what belongs to the process (request
                    context first, trust proxy, CORS allow-list, Node timeouts); the request-timeout
                    interceptor and `GracefulShutdown` (bounded drain, then the pool closes) are
                    registered in the root module; `*.testing.ts` helpers (`startTestApp`,
                    `testConfig`) start the real application for specs and are not built
scripts/seed/       dev seed runner behind `pnpm dev:seed` (T0.6): applies seed/ files in name order,
                    records them in `dev_seeds`, refuses non-local databases; outside src/ so it is
                    never built into dist or the image; own tsconfig, run by Node with type stripping
seed/               seed files `NNN-name.sql` / `.ts` (demo data for the dev database, see its README)
```

Controllers never touch the database; repositories never contain business rules; `domain` imports nothing from Nest.

### Android (`apps/android`)

One app module at first (size budget, spec 9.3), packages:

```
core/          wrapper around the UniFFI bindings, lifecycle, service binding
service/       foreground service: hosts the core, realtime connection, trackers (usage events,
               accessibility), persistent notification with actions
widget/        home-screen widget (Glance), reading state through core/
push/          FCM token registration and message handling (optional at runtime)
feature/<name>/ screen composables + ViewModel per feature (incl. permissions onboarding)
ui/            theme (generated from packages/tokens) and shared components
```

There is deliberately no Kotlin data layer (no Room, Retrofit or repositories): storage, sync and networking live in the Rust core, and `core/` is the only door to them. Split into Gradle modules only when build time or boundaries demand it. The Kotlin package and namespace are `com.naimurrahman.pulse` (ktlint and detekt reject underscores in package names); only the `applicationId` is `com.naimur_rahman.pulse` (D-26). Android backup and device transfer are off (D-27, proposed).

## 4. Cross-cutting conventions

- **Errors:** one error model from the contract (spec 7.1). Rust: `thiserror` types mapped to contract codes at the boundary. Server: domain errors mapped to contract errors in one exception filter. UI: errors arrive as typed values and end in the feedback layer, never swallowed.
- **Time:** integer seconds and UTC instants everywhere; day keys only through the time-math module.
- **IDs:** client-generated UUID v7 for anything a client can create.
- **Configuration:** validated at startup (server) or at build time (clients); no secrets in the repo.
- **Tests sit next to the code** they test (`*.spec.ts`, Rust `#[cfg(test)]` modules and `tests/`, Android `src/test` and `src/androidTest`); shared fixtures (time zones, DST days) live in one place and are used by every implementation.

## 5. Enforcement (A3.3, set up in T0.2)

- TypeScript: dependency-cruiser rules mirroring section 2 (`.dependency-cruiser.cjs`), plus an ESLint rule that keeps `fetch`, `WebSocket`, `XMLHttpRequest` and `EventSource` out of `apps/desktop/src`; both run in `pnpm verify` and CI.
- Rust: crate dependencies in `Cargo.toml` are the rule; `pulse-core` must build without Tauri or Android features.
- Kotlin: package-level rules checked in review until modules are split.
- `change-review` checks new code against this file.

## 6. Decisions

- Spec-level (decided 2026-10-24): D-19 (one shared fixture suite keeps time and credit math identical in the TypeScript server and the Rust core) and D-20 (Kysely for server data access); from the PRD: D-03 (a midnight-crossing session stays one record), D-22 (UI Automation instead of a browser extension), D-23 (FCM push, optional at runtime); spec section 13.
- Structure-level ADRs (accepted 2026-10-24): `docs/decisions/0001-no-monorepo-task-runner.md`, `docs/decisions/0002-ui-primitives-inside-desktop-app.md`. Contract toolchain and wire format (accepted 2026-10-25): `docs/decisions/0003-contract-wire-format.md`.
