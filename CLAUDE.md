# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Pulse is being **rebuilt from scratch**. Besides the planning docs and the agentic setup, the repository holds the T0.2 scaffold: skeleton apps, toolchain configs and the one-command check. There are no product features yet.

Stack: NestJS server with PostgreSQL, shipped with Docker Compose (bundled or external database, optional Caddy HTTPS) · email over SMTP, Google sign-in, optional FCM push · plain WebSocket realtime · a shared **Rust client core** (sync, outbox, SQLite cache, time and credit math, activity tracking) · **Tauri 2 + Svelte 5** desktop (Windows) · **native Kotlin + Jetpack Compose** Android app (sideloaded APK) calling the core through UniFFI. Small installers and low memory are release gates (spec section 9.3).

- The spec (`docs/REBUILD_SPEC.md`) is the single source of truth. It was built from the owner's **PRD** (`docs/product/PRD.md`, user stories `US-x.y`): spec features and tasks cite the stories, and every AC is a testable requirement. Read the relevant section before designing or writing anything, and update the spec when a decision changes it (section 11 decision record, section 13 decisions). Never edit the PRD's content; where the spec implements a story differently, spec section 4.3 says why.
- The legacy app (pnpm/turbo monorepo, v0.0.5, git tags `win-v0.0.5` and `android-v0.0.5`) was deleted in commit `aad9c2f`; browse it with `git show 92a9660:<path>`. The older code-citing version of the spec is also in history. Use legacy code only for context: the spec deliberately drops legacy wire compatibility and many legacy behaviours (spec section 4 lists the mismatches and their resolutions).

## Commands

Prerequisites (not installed by `pnpm verify`): Node 24 with Corepack, rustup, Git Bash, a JDK 17 (Gradle downloads one if missing), the Android SDK with `ANDROID_HOME` set and, on Windows, the MSVC Build Tools with the Windows SDK ("Desktop development with C++") and WebView2. Toolchains are pinned: Node `.node-version` with pnpm from `packageManager`, Rust `rust-toolchain.toml`, JDK 17 and Gradle through the wrapper. On Windows use `apps\android\gradlew.bat`.

- **Everything, as CI and the `auto-commit` gate run it:** `pnpm verify` (frozen install + `node scripts/check.mjs`). One group: `pnpm check --only docs|ts|rust|android` (repeatable).
- **CI:** `.github/workflows/ci.yml` runs the same `check.mjs` groups, one job each, plus actionlint on the workflows; `ci` is the required check on `main` (D-28).
- **Install:** `pnpm install --frozen-lockfile`. Cargo and Gradle fetch their own dependencies.
- **Dev:** server `pnpm --filter @pulse/server dev`; desktop UI in a browser `pnpm --filter @pulse/desktop dev` (port 1420), in Tauri `pnpm --filter @pulse/desktop tauri dev`; Android `apps/android/gradlew -p apps/android installDebug`.
- **Contract:** after changing `packages/contract/src`, regenerate `pnpm --filter @pulse/contract generate` (OpenAPI, JSON Schema, examples in `packages/contract/generated/`), then the Rust types from that OpenAPI `cargo run -p pulse-contract-codegen --locked` (`crates/contract-types/src/generated/`); with `-- --check` either only fails on stale output (the ts and rust groups run both). Mock server `pnpm --filter @pulse/contract mock` (`-- --port N`).
- **Format:** `pnpm format` (Prettier: TS, Svelte, JSON, YAML, CSS, Markdown outside `docs/` and `.claude/`), `cargo fmt --all`, `apps/android/gradlew -p apps/android ktlintFormat`.
- **Lint:** `pnpm lint` (ESLint); architecture boundaries with `pnpm check --only ts` (dependency-cruiser on `apps` and `packages`, plus its rule tests; a failing step prints its exact re-run command); `cargo clippy --workspace --all-targets --locked -- -D warnings`, `apps/android/gradlew -p apps/android ktlintCheck detekt lint`.
- **Type check:** `pnpm -r typecheck` (tsc, svelte-check).
- **Test:** `pnpm -r test`, `cargo test --workspace --locked`, `apps/android/gradlew -p apps/android testDebugUnitTest`. One test: `pnpm --filter @pulse/server test src/app.module.spec.ts -t "boots"` (Vitest file and name filter), `cargo test -p pulse-core <name>`, `apps/android/gradlew -p apps/android testDebugUnitTest --tests '*ApplicationIdTest*'`. Repo tooling: `node --test .claude/hooks/*.test.js scripts/*.test.mjs`; docs: `bash scripts/check-docs.sh`.
- **Build:** `pnpm -r build` (server `apps/server/dist`, desktop UI `apps/desktop/dist`, which the Tauri crate needs before it compiles); Android debug APK `apps/android/gradlew -p apps/android assembleDebug`. Release installers and signing: T0.7.

## Workflow

The agentic setup (role agents, rules, hooks, FE guide, memory) is being built item by item from `docs/AGENTIC_SETUP.md`; tick items there as they land.

Looking for where something is decided or recorded: `docs/knowledge/INDEX.md`. When you learn a durable, non-obvious fact with no better home, add a short note there.

Spec tasks are delivered with the `deliver-task` skill (brief → design → plan → role agents build → verify → QA → fix loop → `auto-commit`); progress lives in `docs/tasks/LEDGER.md`. Role agents in `.claude/agents/`: `ux-designer`, `frontend-engineer`, `backend-engineer`, `core-engineer`, `qa-engineer`, `devops-engineer`. They never commit and never ask the owner directly; the main session does both.

After finishing each task that changed files, run the `auto-commit` skill (`.claude/skills/auto-commit/SKILL.md`). It verifies, runs and debugs the change, then commits only if everything passes.

Everything agent-related for Pulse (skills, agents, rules, hooks, settings) lives in this repo's `.claude/`, never user-level. Most skills and agents are third-party, adapted; `.claude/THIRD_PARTY.md` lists each one's source, commit, licence and changes. `find-skills` searches for more; install project-locally with its read-first steps.

Guard hooks (`.claude/hooks/`) block dangerous commands and protected-file writes and make every `git push` ask the owner. A block comes back as a hook error with the reason: fix the cause, never route around the guard.

Where third-party skills conflict with this repo, this repo wins:

- **Commits:** every commit (including the per-slice commits incremental-implementation asks for) goes through the `auto-commit` gate and its message style, not conventional `feat:` prefixes.
- **Requirements:** `docs/REBUILD_SPEC.md` is the spec. Record decisions there (section 11 / 13), not in a separate SPEC.md; ADRs are only for decisions too detailed for the spec.
- **Pulse overrides** at the top of a skill (e.g. `nestjs-best-practices`, `postgresql-table-design`) win over the rest of that skill.
- **Stack:** examples that assume web/Node tooling (`npx tsc`, Prisma, Vercel, Core Web Vitals, React) are translated to this stack (Svelte 5, Compose, Cargo, Gradle, Tauri, the size budgets in spec section 9.3), not copied.

## What Pulse is

A work-hours tracker for individuals (the owner, then friends, each with their own account): one timer per user, synced live across that user's devices (Windows desktop and Android), self-hostable, fully usable offline. Every tag belongs to a category (Productive, Leisure, Neutral); goals, streaks and stats lead with productive hours. Productive time earns **credits**; Leisure sessions and opt-in tracked gaming or social media spend them; the balance may go negative and Pulse only notifies, never blocks. See spec section 1 for non-goals.

## Navigating the spec

Don't read the whole spec: `node scripts/spec.mjs <IDs | ID..ID | section | A-item | FE-NNN | US-x.y>` prints just the rows, stories or sections you need; `node scripts/spec.mjs --task T2.6` prints a task with everything it cites, user stories and their ACs included.

Everything is referenced by ID, and new code, tests and commits should cite these IDs too:

- `US-x.y` the owner's user stories (PRD); name acceptance tests after them.
- `R-xx` domain rules (section 3): the canonical definition of every time, goal, streak, credit and tracking concept.
- `L1`-`L24` / `S1`-`S15` legacy mismatches and spec contradictions (section 4), each with its resolution; section 4.3 lists where the spec meets a PRD story differently.
- `AUTH-`, `TIM-`, `LOG-`, `TAG-`, `GOAL-`, `INS-`, `SYNC-`, `NOTIF-`, `DESK-`, `MOB-`, `SET-`, `OPS-`, `X-`, `ACT-`, `CRED-` features (section 5), with priority P0 (v1, PRD scope) / P1 (v1, spec additions) / P2 (later).
- `T<milestone>.<n>` tasks (section 12; milestones M1-M7 are the PRD's delivery phases, built in order) with dependencies and "done when" criteria; `WS0`-`WS13` workstreams.
- `D-xx` decisions (section 13); open ones carry a recommendation: until resolved, follow it and say so.
- Appendix A holds defaults and limits; Appendix B holds user-facing copy.

## Architecture invariants (the decisions most likely to be gotten wrong)

Folder layout, dependency rules and layering: `docs/ARCHITECTURE.md`. Per-language rules load from `.claude/rules/` when you touch matching files.

- **Server owns the timer and the clock.** A running session is just a session with no end; there is no paused state and no accumulated counter (pause = stop, resume = start). Clients display `deviceNow + offset` and never invent state.
- **Derived data is never source data.** Stats, streaks, per-day aggregates and the credit ledger are computed from sessions, usage totals, tags, effective-dated goals and credit rates. Aggregates must be fully rebuildable and recalculated in the same transaction as the change (R-54); recategorizing a tag rewrites history (R-50).
- **Sessions across midnight are one record**, clipped per local day at read time in the session's own timezone and shown as one history row per day (R-11, D-03). No scheduled split job and no rollover logic anywhere, whatever the PRD's wording.
- **"Today/this week" use the user's timezone setting**, never the device timezone, and the setting never changes without explicit user action (R-12, R-15).
- **Integer seconds from instants**, one IANA timezone library, all period math in one shared time-math module (T0.5) tested against the timezone/DST matrix listed there. Summaries round down to the minute.
- **Every write is a command with a client-generated ID**, applied optimistically, queued in a durable per-user outbox and replayed idempotently. Per-user revision counter on every change; clients apply only newer revisions and fetch the change feed on gaps. Rejected commands become user-visible sync issues, never silent drops (R-34..R-36, section 8).
- **One contract source** generates server validators, the typed client and mocks; realtime messages are validated too. Clients send commands only through normal operations, never state over the realtime channel.
- **Shared client core** has no UI dependency and takes clock, storage, transport and connectivity by injection so it can be tested with a fake clock. It runs in the desktop's native process (the window is destroyed when closed to tray) and in Android's foreground service, never in the UI.
- **Activity data stays on the device:** sampling and classification run in the client core; only per-day, per-class usage totals (Gaming, Social Media, each tied at most to the session it overlapped) leave it, never app names, URLs, window titles or samples (principle 11, R-38..R-41).
- **Start and end times are the button presses.** The start and summary dialogs (5 s countdown, R-48) never block and never move the times (R-06, R-07).
- **Credits and goals:** goals and streaks count Productive time only (R-51); credit math is per second with rates effective from the instant they are saved (R-42..R-44), identical on server and core through the shared fixtures (D-19).
- **No idle detection, no auto-stop, no "start your timer" reminders** (R-53, owner decision).
