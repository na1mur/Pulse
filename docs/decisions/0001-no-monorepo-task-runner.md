# ADR-0001: No monorepo task runner at first

## Status
Accepted (owner, 2026-10-24)

## Date
2026-10-24

## Context
The repo mixes three build systems: pnpm (TypeScript), Cargo (Rust) and Gradle (Android) (spec section 11, `docs/ARCHITECTURE.md` section 1). Task runners such as Turborepo or Nx cache and orchestrate JavaScript workspaces well but add configuration and do not understand Cargo or Gradle natively. The legacy app used Turborepo.

## Decision
Start without a task runner: root pnpm scripts call the per-package scripts, `cargo` and `./gradlew`. CI runs the three toolchains as separate jobs.

## Alternatives considered

### Turborepo
- Pros: remote and local caching for the TypeScript packages; familiar from the legacy app.
- Cons: Cargo and Gradle steps become opaque shell tasks; one more config to maintain.
- Rejected for now: the TypeScript side is small (server, desktop UI, extension, two packages).

### Nx
- Pros: plugins for many ecosystems.
- Cons: heavy for a small personal project.

## Consequences
Simple setup and fewer moving parts. If local or CI builds become slow, revisit with measurements and supersede this ADR.
