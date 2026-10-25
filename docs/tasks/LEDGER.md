# Task ledger

Status of every spec task (spec section 12) that has been started. Updated by the `deliver-task` skill. Statuses: `in progress` → `in QA` → `done` (or `blocked`). A task's own commit sets `done` with Commit `(this commit)`; the next run replaces that with the hash. Deferred findings stay listed until a later task resolves them.

| Task | Status | Commit | Deferred / notes |
|---|---|---|---|
| T0.1 | done | 32b4f91 | Stack chosen 2026-10-24 (`8841e9b`); D-19, D-20 decided 2026-10-24; PRD merged 2026-10-24 (`040807d`) settling D-03..D-07, D-10, D-11, D-15..D-18, D-21..D-23; recommendations accepted for PostgreSQL, D-08, D-12..D-14, D-24, D-25. D-02 is deferred to T2.6 as a design decision |
| T0.2 | done | (this commit) | D-26 decided 2026-10-24 (app identifiers, minSdk 26); D-27 (Android backup off) proposed for the owner. Deferred: `scripts/check.mjs` resolves the Windows bash path after `planSteps` instead of inside it, and the `check.test.mjs` test 'passes only existing roots' overstates what it proves (review notes); CI checkout needs `fetch-depth: 0` for `check-docs.sh` (T0.3); `rust-toolchain.toml` lists only the Windows target (add Android targets in T0.7); some tracked `.claude/` files are CRLF in this working tree (pre-existing; fresh clones get LF); a clone inside the OS temp folder fails one hook test (TEMP must point elsewhere); detekt 1.23.8 until 2.x is stable; `versionCode` must exceed the legacy app's (T0.7 / MOB-05) |
