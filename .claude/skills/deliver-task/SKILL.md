---
name: deliver-task
description: Deliver one Pulse spec task (e.g. "T1.4") through a risk lane (Fast, Standard or Critical, D-33) - brief, design (UI tasks), build with the right engineer agent, verify, QA (Critical only), fix loop, review and commit - keeping a task file and the progress ledger up to date. Use when the owner says "do T1.4", "next task", or asks to implement a spec task.
---

# Deliver a task

You are the lead: you coordinate, the role agents do the work, the owner decides. Keep your own context for coordination; do not implement in this session except trivial glue.

> Process ideas borrowed from obra/superpowers `subagent-driven-development` and `writing-plans` (MIT, commit 2ce8aa1): the per-task report file as persistent memory, resuming the original implementer with findings verbatim, scoped re-reviews, deferring minor findings to a ledger, and the plan's Interfaces / Review focus sections. Reviewing itself is done by `change-review` (adapted from mattpocock) and `qa-engineer`, not superpowers' reviewer prompt.

## Lanes (D-33)

Pick the lane when writing the brief; record it in the task file (`Lane:`) and the ledger note. When unsure, take the heavier lane. The test for Critical: could a silent bug corrupt or leak user data?

| Lane | Used for | Steps |
|---|---|---|
| **Fast** | Plumbing, config, docs, scaffolding, dev tooling, simple CRUD or UI that copies an existing pattern | 1 (a few lines), 4, 5.1, 7. No plan, no QA, no change-review |
| **Standard** (default) | Most feature tasks: endpoints, screens, settings, notifications | 1 (short), 2 if UI, 4, 5.1, then the building agent checks every AC and writes the `US-x.y`-named tests; 6, 7 with change-review on the **Spec axis only** |
| **Critical** | Sync and outbox, auth, time math, credits and the ledger, activity data and privacy, migrations | Every step below, unchanged: plan, build, verify, `qa-engineer`, fix loop, full `change-review` |

Fix budgets: Fast and Standard get **2** rounds in total (verify and gate failures together); Critical keeps its separate QA and gate budgets (step 6). Only Critical and High findings block a commit in any lane. Everything else goes to `docs/tasks/BACKLOG.md` (one line each: task, severity, finding), not into the ledger row, which holds only status, commit and a one-line note.

## 0. Pick the task

- **Housekeeping first:** if a ledger row says `done` with Commit `(this commit)`, replace it with the real hash: `git log -1 --format=%h --grep='^Task: <task-id>$'` (escape the dots, e.g. `T1\.4`); that edit goes into this task's commit.
- **Resume before starting:** if a task is `in progress`, `in QA` or `blocked`, offer to continue it first (from its task file; create the file if it is missing).
- **The owner names a task**, or says "next task": walk spec section 12 in milestone order, then numeric ID order (T1.9 before T1.10), skipping tasks already in the ledger, and take the first whose dependencies are all `done`. Reading the Deps column: `-` = none; comma lists and ranges (`T3.1..T3.5`) = each task; `all M3` = every task of that milestone; anything else, ask the owner. Tasks finished outside this skill count as done only once the owner confirms and a ledger row says so.
- If the chosen task's dependencies are not done, say which and stop.
- Create `docs/tasks/<task-id>.md` from the template in `docs/tasks/README.md` and set the ledger row to `in progress`.
- **Decision tasks** (like T0.1, which settles open decisions rather than building code) skip steps 2-6: work through the decisions with the owner (AskUserQuestion, recommended option first, batched), record each in the spec (`spec-editing` rule), then go to step 7.

## 1. Brief

Run `node scripts/spec.mjs --task <task-id>` (the task row plus every rule, feature, user story and section it cites). Paste it into the task file under **Brief**, with "Done when" and the cited user stories' ACs verbatim (both are the acceptance bar), and add the context the engineers need:
- the `docs/ARCHITECTURE.md` sections for the parts the task touches;
- ADRs in `docs/decisions/` that cite those IDs (`grep -l <ID> docs/decisions/`);
- for UI tasks, the relevant `docs/FE_GUIDE.md` sections and `FE-NNN` decisions;
- the knowledge index (`docs/knowledge/INDEX.md`) once it exists (A0.4).

Note open spec decisions (`D-xx`) the task depends on; if one blocks the task, ask the owner (AskUserQuestion, recommended option first) before going further.

## 2. Design (UI tasks only)

Dispatch `ux-designer` with the brief. Ask the owner its `QUESTIONS FOR OWNER` directly (AskUserQuestion) and settle its `DECISION NEEDED` blocks with the `design-decision` skill; resume it with the answers and link the saved design brief in the task file.

## 3. Plan

**Critical lane only** (Standard: a short slice list in the task file is enough; Fast: skip). Use `planning-and-task-breakdown`. Write in the task file:
- **Slices**: thin vertical steps, each testable on its own, each naming its owner agent (`backend-engineer`, `core-engineer`, `frontend-engineer`, `devops-engineer`).
- **Interfaces**: contract changes, function signatures, events and files each slice adds or changes, so parallel slices agree.
- **Review focus**: the riskiest parts (spec rules most likely to be broken, tricky edge cases) for reviewers and QA.

Slices with disjoint files may run in parallel; otherwise run them in order.

## 4. Build

For each slice, dispatch its agent with: the task file path, the slice, the Interfaces section, and "test first; never commit; return files changed, tests and commands run with output, open questions". Append each agent's report to the task file under **Reports**. Relay any `DECISION NEEDED` to the owner as in step 2.

## 5. Verify, then QA (QA is Critical lane only)

1. Run `auto-commit` in **verify-only** mode, as a caller-owned fix loop, with the task ID and file list: format, lint, type check, tests, build, and running the changed parts, without reviewing or committing. Failures go back to the building agent (step 6) before QA starts.
2. **Critical lane:** set the ledger row to `in QA` and dispatch `qa-engineer` with the task file. It writes `docs/qa/<task-id>.md` and returns APPROVED or REJECTED.

## 6. Fix loop

- Critical/High/Medium QA bugs, and verify or review failures from the gate, go back to the agent that built the affected slice (in this skill the lead never fixes code itself): resume it if possible, sending the findings verbatim; otherwise dispatch a fresh one with the task file path and the findings.
- Each round: fix, re-run the covering tests, append a fix report; then a **scoped** re-check: QA re-tests only the reported bugs and anything the fix diff touched; a gate failure is re-checked by the gate, plus QA if the fix changed behaviour QA tested.
- Budgets are separate: two rejected QA rounds, and three gate rounds (each round = engineer fix + another `auto-commit` run). When either runs out, stop and bring the open findings to the owner with your recommendation.
- Low and Medium bugs (Medium too outside the Critical lane) and out-of-scope observations do not loop: add them to `docs/tasks/BACKLOG.md`, not the ledger row.

## 7. Gate and commit

Set the ledger row to `done`, Commit `(this commit)`, with any deferred items, and the task file's Status to `done`. Then run `auto-commit` (full mode, caller-owned fix loop) with the task ID and the task's file list (product code, tests, task file, QA report, ledger, any FE-guide or spec updates): it verifies, runs `change-review` (lane per D-33; skipped for Fast) and commits with the `Task: <task-id>` trailer. Its failures go through step 6. If it does not commit, set both the ledger row and the task file's Status back to `in QA` or `blocked`.

## 8. Report

Tell the owner in a few lines: what was delivered against "Done when" and the user stories' ACs, the commit, decisions they made along the way (`FE-NNN`, `D-xx`), QA verdict, deferred items, and what could not be verified here.
