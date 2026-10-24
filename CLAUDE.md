# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Pulse is being **rebuilt from scratch**. The repository currently contains only `docs/REBUILD_SPEC.md`; there is no code, no build and no tests yet. The stack is decided (spec section 11) but not scaffolded (T0.2).

Stack: NestJS server (PostgreSQL proposed) · plain WebSocket realtime · a shared **Rust client core** (sync, outbox, SQLite cache, time math, activity segments) · **Tauri 2 + Svelte 5** desktop (Windows) · **native Kotlin + Jetpack Compose** Android app (sideloaded APK) calling the core through UniFFI · WXT browser extension talking to the desktop app over native messaging. Small installers and low memory are release gates (spec section 9.3).

- The spec is the single source of truth. Read the relevant section before designing or writing anything, and update the spec when a decision changes it (section 11 decision record, section 13 open decisions).
- The legacy app (pnpm/turbo monorepo, v0.0.5, git tags `win-v0.0.5` and `android-v0.0.5`) was deleted in commit `aad9c2f`; browse it with `git show 92a9660:<path>`. The older code-citing version of the spec is also in history. Use legacy code only for context: the spec deliberately drops legacy wire compatibility and many legacy behaviours (spec section 4 lists the mismatches and their resolutions).

## Commands

None yet (no code). Fill this in during T0.2: install, dev, format check, lint, type check, test (including how to run a single test), build per target.

## Workflow

The agentic setup (role agents, rules, hooks, FE guide, memory) is being built item by item from `docs/AGENTIC_SETUP.md`; tick items there as they land.

After finishing each task that changed files, run the `auto-commit` skill (`.claude/skills/auto-commit/SKILL.md`). It verifies, runs and debugs the change, then commits only if everything passes.

`.claude/skills/` also holds 13 third-party skills from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT, commit `aeac41d`, installed 2026-10-24): TDD, debugging, incremental implementation, API design, frontend UI, security, performance, code review, planning, ADRs, CI/CD, observability, source-driven development. Where they conflict with this repo:
- **Commits:** every commit (including the per-slice commits incremental-implementation asks for) goes through the `auto-commit` gate and its message style, not conventional `feat:` prefixes. `git-workflow-and-versioning` is not installed.
- **Requirements:** `docs/REBUILD_SPEC.md` is the spec. Record decisions there (section 11 / 13), not in a separate SPEC.md; ADRs are only for decisions too detailed for the spec.
- **Stack:** their examples assume web/Node tooling (`npx tsc`, Prisma, Vercel, Core Web Vitals). Translate to this stack (Cargo, Gradle, Tauri, the size budgets in spec section 9.3) instead of copying them.

## What Pulse is

A personal work-time tracker: one timer per user, synced live across that user's devices (Windows desktop and Android first), self-hostable backend, fully usable offline. Opt-in activity tracking classifies games and social media as leisure and spends **leisure credit** earned from timer sessions; it only tracks and notifies, never blocks. See spec section 1 for non-goals.

## Navigating the spec

Everything is referenced by ID, and new code, tests and commits should cite these IDs too:

- `R-xx` domain rules (section 3): the canonical definition of every time, goal, streak and stat concept.
- `L1`-`L24` / `S1`-`S15` legacy mismatches and spec contradictions (section 4), each with its resolution.
- `AUTH-`, `TIM-`, `LOG-`, `TAG-`, `GOAL-`, `INS-`, `SYNC-`, `NOTIF-`, `DESK-`, `MOB-`, `SET-`, `OPS-`, `X-` features (section 5), with priority P0 (MVP) / P1 (v1.0) / P2 (later).
- `T<milestone>.<n>` tasks (section 12) with dependencies and "done when" criteria; `WS0`-`WS12` workstreams.
- `D-xx` open decisions (section 13) with recommendations; until resolved, follow the recommendation and say so.
- Appendix A holds defaults and limits; Appendix B holds user-facing copy.

## Architecture invariants (the decisions most likely to be gotten wrong)

- **Server owns the timer and the clock.** A running session is just a session with no end; there is no paused state and no accumulated counter (pause = stop, resume = start). Clients display `deviceNow + offset` and never invent state.
- **Statistics are never stored.** They are computed from sessions + effective-dated goal settings. Any cache must be fully rebuildable and updated in the same transaction as the session change.
- **Sessions across midnight are one record**, clipped per local day at read time in the session's own timezone (R-11). No rollover or splitting logic anywhere.
- **"Today/this week" use the user's timezone setting**, never the device timezone, and the setting never changes without explicit user action (R-12, R-15).
- **Integer seconds from instants**, one IANA timezone library, all period math in one shared time-math module (T0.5) tested against the timezone/DST matrix listed there. Summaries round down to the minute.
- **Every write is a command with a client-generated ID**, applied optimistically, queued in a durable per-user outbox and replayed idempotently. Per-user revision counter on every change; clients apply only newer revisions and fetch the change feed on gaps. Rejected commands become user-visible sync issues, never silent drops (R-34..R-36, section 8).
- **One contract source** generates server validators, the typed client and mocks; realtime messages are validated too. Clients send commands only through normal operations, never state over the realtime channel.
- **Shared client core** has no UI dependency and takes clock, storage, transport and connectivity by injection so it can be tested with a fake clock. It runs in the desktop's native process (the window is destroyed when closed to tray) and in Android's foreground service, never in the UI.
- **Activity data is minimal:** only the executable name, package name or registrable domain leaves the device; never full URLs or window titles (principle 11). Credit balances, like all stats, are derived and rebuildable.
- No blocking dialogs around start/stop; the note is added after stopping, and the end time is always the stop instant.
