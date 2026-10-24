# Task ledger

Status of every spec task (spec section 12) that has been started. Updated by the `deliver-task` skill. Statuses: `in progress` → `in QA` → `done` (or `blocked`). A task's own commit sets `done` with Commit `(this commit)`; the next run replaces that with the hash. Deferred findings stay listed until a later task resolves them.

| Task | Status | Commit | Deferred / notes |
|---|---|---|---|
| T0.1 | done | (this commit) | Stack chosen 2026-10-24 (`8841e9b`); D-19, D-20 decided 2026-10-24; PRD merged 2026-10-24 (`040807d`) settling D-03..D-07, D-10, D-11, D-15..D-18, D-21..D-23; recommendations accepted for PostgreSQL, D-08, D-12..D-14, D-24, D-25. D-02 is deferred to T2.6 as a design decision |
