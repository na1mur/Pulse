# Task ledger

Status of every spec task (spec section 12) that has been started. Updated by the `deliver-task` skill. Statuses: `in progress` → `in QA` → `done` (or `blocked`). A task's own commit sets `done` with Commit `(this commit)`; the next run replaces that with the hash. Deferred findings stay listed until a later task resolves them.

| Task | Status | Commit | Deferred / notes |
|---|---|---|---|
| T0.1 | in progress | - | Stack chosen 2026-10-24 (`8841e9b`); D-19, D-20 decided 2026-10-24; still open (revisit with the owner's user stories): database confirmation, D-02..D-08, D-11..D-18 |
