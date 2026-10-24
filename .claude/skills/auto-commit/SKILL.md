---
name: auto-commit
description: Verify, test, run and debug a just-finished task in Pulse, then commit it if everything passes. Use automatically after completing any task in this repo that changed files (a spec task T-x.y, a feature, a fix, a refactor, infra/config, or a spec/docs decision), and when the user says "commit", "ship it" or "/auto-commit". Do not use mid-task or for exploratory spikes.
---

# Auto-commit

Close out one coherent unit of work: prove it works, fix it if it doesn't, then commit it with a clear message. Never commit broken or unverified work.

## 0. Decide whether this is commit-worthy

Skip (and say why) when:
- the task is not finished, or this is a spike or a half-done tweak that belongs in the next commit;
- the work only produced a plan and no repo changes;
- the user said not to commit yet.

## 1. Scope the change

Run in parallel: `git status`, `git diff`, `git diff --staged`, `git log -5 --oneline`.

- Identify the task and the spec IDs it implements (`T-x.y`, feature IDs, `R-xx` rules) from `docs/REBUILD_SPEC.md`.
- If the task has a "Done when" in spec section 12, that is the acceptance bar. Check it explicitly.
- Note any changed files that are unrelated to this task. They are left out of the commit.

## 2. Verify

Use the commands in the **Commands** section of `CLAUDE.md`. If a command isn't listed there, find it in the workspace manifests (`package.json` scripts, `Cargo.toml`, Gradle), use it, and add it to `CLAUDE.md`.

Run, in this order, scoped to the affected packages first and then the whole repo:
1. Format check
2. Lint
3. Type check (TypeScript, `cargo check`/`clippy` for Rust, Kotlin compile for Android modules)
4. Tests: unit, plus property, contract and integration tests that touch the change
5. Build every affected target

When only docs changed: run `bash scripts/check-docs.sh` (spec IDs defined and unique, checklist items and commit hashes valid), then check by reading that section numbers and cross-references still line up, and that the decision record (section 11) and open decisions (section 13) agree with each other.

## 3. Run it

Tests passing is not enough. Run the affected part for real:
- **Server:** start it, check liveness/readiness, then call the new or changed operation and check the response and error shapes (spec section 7).
- **Client UI / desktop:** launch the app (use the `run` skill if it helps), exercise the changed flow, and check that no errors appear in the console or logs.
- **Mobile:** run it on an emulator or device if one is available.
- **Sync / offline changes:** run the flow once offline, then reconnect and confirm it converges.

If something cannot be run here (no emulator, no signing keys, an OS-only API), say exactly what was not run. Never report it as passed.

## 4. Debug loop

On any failure:
1. Read the full error and find the root cause. Don't guess-patch.
2. Fix it, then rerun from the step that failed and every step after it.
3. Repeat, up to **3 rounds**. If it still fails, stop. Do not commit. Report the failing command, the output and what you tried.

Never make it pass by skipping, deleting or weakening tests or assertions, loosening lint or type rules, adding `@ts-ignore`/`eslint-disable` without a stated reason, or using `--no-verify`.

## 5. Review the diff before staging

- No secrets, `.env` files, credentials, keystores or signing keys. If you find any, stop and warn the user.
- No leftover debug output, commented-out code or stray TODOs created by this task.
- Generated files are committed only if the repo already commits them.

## 6. Commit

Stage explicit paths that belong to this task. Don't use `git add -A` or `git add .`.

Message format (matches this repo's history):
- Subject: one imperative sentence ending with a period, starting with `Add`, `Fix`, `Enhance`, `Refactor`, `Update` or `Remove`, and saying what changed and why it matters. Example: `Add timer start/stop commands with idempotent replay.`
- Body (optional): spec IDs covered (`T1.4, TIM-01, R-01..R-05, R-34`), and anything verified manually or not runnable here.

Commit with a heredoc (Bash tool) so the formatting is kept:

```bash
git commit -F - <<'EOF'
Add timer start/stop commands with idempotent replay.

Implements T1.4 (TIM-01, R-01..R-05, R-34).
EOF
```

Then run `git status` to confirm the commit landed.

## Git safety

- Never push unless the user asks.
- Never change git config, use `--no-verify`, or force-push.
- Never amend, except when a hook modified files after a successful commit. If a pre-commit hook fails, fix the problem and create a new commit.
- No empty commits.

## 7. Report

Tell the user in a few lines: what was committed (short hash and subject), what was verified and run, and anything that was skipped or could not be run.
