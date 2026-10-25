# Agentic setup checklist

Goal: make Pulse an exemplary agentic-coding project. Work flows the way a senior team would run it: a **UI/UX designer** designs, senior **frontend** and **backend** engineers build, test and debug, a **QA engineer** reviews, and a **DevOps engineer** ships. Every step is backed by skills, rules, subagents and hooks in this repo.

How to use this file:
- Work through items **one at a time**, in the suggested order (bottom of the file). Each item: settle its decision (if any) → build it → verify it → tick it with the commit hash.
- Items marked *(needs scaffold)* can only be finished after T0.2 creates the code layout; their rules/agents can be drafted earlier.
- Status: `[ ]` open · `[~]` in progress · `[x]` done (commit).

## Waiting on the owner (as of 2026-10-24)

- **Spec decisions:** all settled (T0.1 done 2026-10-24); D-02 comes up as a design decision at T2.6.
- **Design decisions:** none taken without the owner; `docs/FE_GUIDE.md` section 11 lists what is still open.

Settled 2026-10-24: hooks A0.6/A4.4/A4.5 added, A4.6 covered by the owner's Orca hooks, official Svelte MCP added (A7.2), `ARCHITECTURE.md`, ADR-0001/0002, D-19 and D-20 accepted. The owner's PRD (user stories) was merged into the spec, architecture, FE guide, agents and rules; `spec.mjs` looks up `US-x.y` and `check-docs.sh` checks every story is cited.

## Already in place

- [x] `CLAUDE.md` with spec navigation and architecture invariants (`bff9d75`, `8841e9b`)
- [x] `auto-commit` skill: verify → run → debug → commit gate (`bff9d75`)
- [x] 13 agent-skills skills (TDD, debugging, incremental implementation, API design, frontend UI, security, performance, code review, planning, ADRs, CI/CD, observability, source-driven development) (`e462d4e`)
- [x] Stack decided and recorded in the spec (`8841e9b`)
- [x] Stack knowledge skills (installed 2026-10-24, see sourcing below): `tauri-v2`, `svelte5-best-practices` (SvelteKit/migration parts removed), `mobile-android-design`, `rust-best-practices`, `nestjs-best-practices` and `postgresql-table-design` (both with Pulse overrides), `playwright-best-practices` (browser UI checks only)

## Sourcing: existing skills first

Rule: install an existing, well-made skill/agent when one fits; adapt it when it nearly fits; write our own only when nothing fits. Reviewed 2026-10-24 from a skills.sh search (18 repos read, nothing executed).

| Need | Source | Verdict |
|---|---|---|
| Commit gate (`auto-commit`) | nothing replaces it (superpowers `verification-before-completion` is already covered by steps 2–3) | keep custom |
| A0.4 code context / memory | **graphify** (`graphify-labs/graphify` @92741d1, Apache-2.0): local tree-sitter graph for TS, Svelte, Rust, Kotlin; project-scoped install; git hook rebuilds | adapt, after T0.2 |
| A0.4 decision memory | nothing fits | small custom `docs/knowledge/` |
| A0.5 spec lookup, A0.6 briefing | nothing fits (superpowers' SessionStart hook forces skill use every session: rejected) | custom |
| A1.1 `ux-designer` | wshobson `ui-ux-designer` agent + impeccable references (`shape.md`, critique heuristics, `android.md`) | adapt |
| A1.2 `frontend-engineer` | no Svelte/Compose agent exists | custom agent using `frontend-ui-engineering`, `svelte5-best-practices`, `mobile-android-design` |
| A1.3 `backend-engineer` | wshobson `backend-architect` is microservice/K8s-centric | custom agent using `nestjs-best-practices`, `postgresql-table-design` |
| A1.4 `core-engineer` | wshobson `rust-pro` agent | adapt; uses `rust-best-practices`, `tauri-v2` |
| A1.5 `qa-engineer` | wshobson ship-mate `qa` agent (acceptance criteria → test cases, severity, never edits product code) | adapt |
| A1.6 `devops-engineer` | wshobson `deployment-engineer` is GitOps/K8s | custom agent on `ci-cd-and-automation` |
| A1.7 delivery pipeline | nothing fits as-is | custom; borrow superpowers' reviewer prompt, ledger and fix loop, and writing-plans' Interfaces / Review Focus |
| A1.8 review before commit | mattpocock `code-review` (parallel standards + spec reviewers) | adapted as `change-review`, called by `auto-commit` |
| A2.3 design decisions | Emil Kowalski `prototype` (3–5 live variants, owner picks) | adapt for visual options; custom `design-decision` skill owns the ask → apply → record loop |
| A2 design quality | Vercel `web-design-guidelines` (pin its remote rules locally), Emil `break-ui` (edge-case data) | adapt / install |
| A2.4 tokens, Compose UI rule | nothing fits | custom |
| A2.5 / A5.2 visual and E2E | `playwright-cli` (copy into project), `playwright-best-practices`; Android: official `android-cli` (adapt, after T0.2); Maestro skill (adapt: Compose `testTag`, drop RN/iOS); Tauri window: WebdriverIO + `tauri-driver` | mixed; desktop E2E custom |
| A3 architecture and standards | ECC `rules/{rust,kotlin,typescript}` as seeds; mattpocock `codebase-design` as reading | custom docs |
| A4.2 command guard | ECC `block-no-verify.js` + `shell-scan.js` (parses the shell command, fails closed) | adapt + small custom push/delete check |
| A4.3 protected files | ECC `config-protection.js` | adapt (secrets, generated contract files; its linter-config lock kept) |
| A4.5 Stop reminder, A6.2 ship | nothing fits | custom |

Rejected after review: superpowers bundle (forces skill use every session, commits per step, decides design itself), impeccable as installed (downloads a binary to `~/.impeccable`, competing `DESIGN.md`), ui-ux-pro-max (picks palettes itself), Anthropic `frontend-design` (bold aesthetics vs the spec's restraint), Understand-Anything (user-level install, LLM-driven auto-updates), mattpocock `git-guardrails` (needs `jq`, misses `--no-verify`), wshobson frontend/backend/devops/test agents (React/K8s-generic), `github-actions-templates`.

Known conflict to handle in A2.2: `frontend-ui-engineering` lists "purple/indigo everything" as an anti-pattern, but the brand colour is violet `#7C3AED`; the brand colour comes from the tokens.

---

## A0. Agent environment foundations

- [x] **A0.1 Make `find-skills` visible to Claude Code.** It was installed in `~/.agents/skills/` (the `npx skills` location), which Claude Code does not read.
  - Decided: copied into this repo (`.claude/skills/find-skills/`); **everything for Pulse is project-local, nothing user-level**. Adapted to install project-locally and read every skill before installing it.
- [x] **A0.2 Project settings.** `.claude/settings.json` (committed): allowlist for git read/commit, pnpm, cargo and Gradle commands; deny list for force push, `git commit --no-verify`/`-n`, `git config`, and reading secrets and signing material (writes to them are blocked by A4.3's hook; a test keeps both lists in step). `.claude/settings.local.json` (gitignored) for personal overrides. Root `.gitignore` and `.gitattributes` (LF everywhere, CRLF for Windows scripts).
  - Verified: the `git config` deny rule blocks in a live session.
  - Limit: permission rules match command prefixes, so a flag placed later (`git commit -m x --no-verify`) slips through; A4.2's hook closes that gap (verified).
  - Note: user-level Orca hooks already exist; project hooks add to them.
- [x] **A0.3 Path-scoped rules.** `.claude/rules/*.md` with `paths:` frontmatter, so each rule loads only when files it covers are touched. Keeps `CLAUDE.md` short and saves tokens.
  - Verified with headless sessions: a rule with a quoted `paths:` list loaded after reading its file and stayed out when another file was read.
  - First rules: `spec-editing.md` (spec) and `agent-config.md` (`.claude/`, `CLAUDE.md`, this file). `scripts/check-docs.sh` checks spec IDs, checklist items and commit hashes; the `auto-commit` gate uses it for docs-only changes.
- [~] **A0.4 Agent memory / knowledge graph.** A project memory that lets an agent find relevant facts without rereading large files.
  - Done: `docs/knowledge/INDEX.md` (where each kind of fact lives, plus notes) and a first note of tooling gotchas; `CLAUDE.md` points to it. Pending: graphify, after T0.2.
  - Plan (revised after review): **graphify** for code (project install, `GRAPHIFY_BACKEND=none` so code graphs never call a model, CLI in a gitignored repo-local Python venv, git hook rebuilds; its generated `CLAUDE.md` section moved into a path-scoped rule; its PreToolUse hooks pipe-tested with ours) once code exists, plus a small in-repo `docs/knowledge/` (`INDEX.md` + linked notes) for decisions and facts that are not in code. Serena and an MCP memory server are no longer needed.
  - Done when: an agent answers "where is X / why is Y" by reading the index and one or two notes.
- [x] **A0.5 Token-efficient spec access.** Decided: option (a), a lookup script (one spec file, no broken references). `node scripts/spec.mjs R-42 T1.4 R-37..R-39 T1.1..T1.3 TIM-01/02/03 MOB-* 8.3 A1.7 FE-003` prints only those table rows (with their header), sections, checklist items or FE decisions; `US-5.2` prints a user story with its ACs (added 2026-10-24 with the PRD); `--task T1.4` prints a task plus everything it cites. Unknown IDs and empty ranges exit 1. Agents and `deliver-task` use it instead of reading whole files.
  - Verified: by hand and by the change review: rows, all range forms (padded, unpadded, dotted, reversed), slash lists, wildcards, sections, checklist items, `--task T1.4`, missing IDs.
- [x] **A0.6 Session-start briefing.** `.claude/hooks/session-brief.js` on `SessionStart`: current milestone and next spec task not started, unfinished ledger tasks, open spec decisions, open design questions, setup progress, uncommitted changes, last three commits, where to look things up; generated from the spec, ledger and docs, under 20 lines, never fails the session.
  - Verified: tests in `.claude/hooks/session-hooks.test.js` (milestone, next task, open decisions without decided ones, short output, survives missing docs); output checked by hand.
- Original plan: **A0.6 Session-start briefing.** A `SessionStart` hook that prints a ~30-line "current state": current milestone, next open tasks, open decisions, pointers to the knowledge index. Generated from the spec and this file, not hand-maintained.

## A1. Role agents and the delivery pipeline

Subagents live in `.claude/agents/`; each has a focused system prompt, a restricted tool set and the skills/rules it must follow.

- [x] **A1.1 `ux-designer`.** Owns the FE guide (A2), user flows and screen specs. Produces a design brief **before** any UI code; returns interview questions and every uncovered design decision to the main session as blocks (subagents cannot ask the owner), which asks via `design-decision` and builds mockups for visual choices. Writes only in `docs/design/` and the FE guide; until the guide exists, spec section 10 is the guide.
  - Verified: Claude Code loads the agent (frontmatter valid); change review of the definitions (fixes applied).
- [x] **A1.2 `frontend-engineer`.** Custom (no Svelte/Compose agent exists). Builds desktop and Android UI from the design brief and FE guide; returns `DECISION NEEDED` instead of deciding; tokens and primitives only; Vitest / ViewModel tests, light/dark screenshots, `break-ui`; never commits.
  - Verified: Claude Code loads the agent; change review (fixes applied).
- [x] **A1.3 `backend-engineer`.** Custom (wshobson's `backend-architect` is microservice-centric). NestJS, PostgreSQL, realtime gateway and contract package: contract first, idempotent revisioned writes, database-enforced invariants, shared fixtures, integration tests on real PostgreSQL; never commits or asks the owner directly.
  - Verified: Claude Code loads the agent; change review (fixes applied).
- [x] **A1.4 `core-engineer`.** Rust client core, Tauri native side (tray, OS events, desktop trackers, native host), UniFFI bridge, Kotlin foreground service and Android trackers. Decided: a separate agent (different language and failure modes from the NestJS backend). Never commits; returns results to the main session.
  - Verified: Claude Code loads the agent; change review (fixes applied).
- [x] **A1.5 `qa-engineer`.** Reviews finished work against the task's "Done when" and R-rules plus Pulse's risk areas (offline, midnight/DST, clock skew, session-dialog timing, recalculation, sync issues); writes `docs/qa/<task>.md`; Critical/High/Medium bugs reject the task; escalates after two rejections. Writes tests and QA reports only, never commits.
  - Verified: Claude Code loads the agent; change review (fixes applied).
- [x] **A1.6 `devops-engineer`.** Custom (wshobson's `deployment-engineer` is GitOps/Kubernetes). CI for pnpm/Cargo/Gradle, server image, signed installer and APK, update channels, size budgets in CI (dependency hygiene and backups from A6 too); never commits, pushes, publishes or touches keys, and never asks the owner directly.
  - Verified: Claude Code loads the agent; change review (fixes applied).
- [x] **A1.7 Delivery pipeline skill.** `deliver-task` (`/deliver-task T1.4`, or "next task"): brief (`spec.mjs --task` plus architecture, ADRs, FE guide, knowledge) → design via `ux-designer` and `design-decision` (UI tasks) → plan with slices, Interfaces and Review focus → build with the owning engineer agents → verify (`auto-commit` verify-only) → QA (`qa-engineer`) → fix loop (resume the original implementer, scoped re-checks, separate QA and gate budgets, then escalate) → `auto-commit` (verify, `change-review`, commit, ledger in the same commit) → report. "Next task" reads the Deps column formats; decision tasks like T0.1 run as owner conversations. Task memory in `docs/tasks/<task-id>.md`, status in `docs/tasks/LEDGER.md` (seeded with T0.1 in progress). Process ideas borrowed from superpowers (credited in the skill and `THIRD_PARTY.md`).
  - Verified: change review of the skill against `auto-commit`, `change-review`, the agents and the spec's section 12 formats (fixes applied).
  - Decided: a sequential skill that delegates to subagents (cheaper); multi-agent Workflows only on the owner's request.
  - Not yet verified on a real task (A8.1 dry run, after T0.2).
- [x] **A1.8 Senior code review in the gate.** `change-review` skill (adapted from mattpocock `code-review`), run by `auto-commit` step 5 on every change except trivial docs edits. Decided: by change type, not diff size, since small diffs can break the spec.
  - Verified: dry-run on its own change; the two reviewers found 2 hard violations and 6 logic bugs (folder-only untracked listing, empty-diff check, review scope ≠ commit scope, unfixable "missing hash" block, unclear round budget, unnamed second axis), all fixed before commit.

## A2. Frontend guide and the design-decision loop

- [x] **A2.1 `docs/FE_GUIDE.md` skeleton.** Principles, tokens, component catalogue, layout and navigation, patterns, behaviour, accessibility, copy, desktop vs Android, **decision log** (`FE-NNN`) and **open questions** (decisions noticed while the owner is away). Holds only spec-derived rules cited by ID; every section marks where owner decisions are still open.
- [x] **A2.2 Frontend rule.** Lives in the platform rules instead of a separate `frontend.md`: `.claude/rules/svelte.md` (desktop UI) and `kotlin.md` (Android) both make the FE guide binding, require reading it before building UI, and send uncovered design or flow questions to `design-decision`.
- [x] **A2.3 `design-decision` skill.** Check the guide first; frame the question and its scope of reuse; 2–4 options with ASCII previews, live variants (`prototype` skill, adapted from Emil Kowalski) or a mockup artifact, recommended first; ask via AskUserQuestion (subagents return a `DECISION NEEDED` block; when the owner is away, park it under open questions instead of deciding); apply; record the `FE-NNN` log row and the reusable rule in the matching section.
  - Also installed for design quality: `break-ui` (worst-case data; QA) from Emil Kowalski's skills, the `playwright-cli` skill copied into the project for screenshots, and `web-design-guidelines` (Vercel's UI audit, rules pinned locally instead of fetched at runtime).
- [ ] **A2.4 One source of design tokens.** A tokens file that generates both the desktop CSS variables and the Compose theme; lint against hard-coded colours, spacing and font sizes. *(needs scaffold; overlaps T1.9)*
- [ ] **A2.5 Visual verification.** UI changes are checked with screenshots in light and dark themes (the `playwright-cli` skill for the Svelte UI in a browser; the running app for Tauri and Android). *(needs scaffold)*

## A3. Engineering standards (clean code and architecture)

- [x] **A3.1 `docs/ARCHITECTURE.md`.** Repository layout (`apps/`, `crates/`, `packages/`), dependency rules (UI never talks to the server; `pulse-core` platform-free; client and server meet only in the contract), layering for the Rust core, desktop UI, Tauri shell, server (one module per spec 7.2 group) and Android (no Kotlin data layer, by design), cross-cutting conventions and enforcement plan. Status: proposed, for the owner to confirm. Open points went where they belong: D-19/D-20 in spec section 13, ADR-0001/0002 (proposed) in `docs/decisions/`.
- [x] **A3.2 Per-language rules** in `.claude/rules/`, path-scoped: `code-style.md` (all code: naming, function and file size, comment policy, no speculative generality, error handling, test style, dependencies) plus `rust.md`, `typescript.md`, `nestjs.md`, `svelte.md`, `kotlin.md` (Pulse constraints per stack: purity, no `unwrap`/`any`/`!!`, error model, contract types, tokens-only UI, FE guide precedence, test tools). Language idioms come from the installed stack skills; ECC's generic rule files were not copied, to avoid a third source.
- [x] **A3.3 Enforce with tools, not prose.** Prettier + ESLint (with import-boundary rules), `rustfmt` + `clippy` (warnings denied), `ktlint` + `detekt`, and an architecture-boundary check (dependency-cruiser or ESLint boundaries). Landed in T0.2: `prettier.config.mjs`, `eslint.config.mjs` (type-aware typescript-eslint, eslint-plugin-svelte, no network globals in the desktop UI), `.dependency-cruiser.cjs` (14 rules for `docs/ARCHITECTURE.md` section 2), `clippy.toml` + workspace lints, ktlint + detekt + Android Lint in `apps/android`; all run by `pnpm verify` (`scripts/check.mjs`).
  - Verified: deliberate violations (unformatted file, `any`, a server-to-desktop import) each failed their step; every dependency-cruiser rule fired on probe files; clippy denies production `unwrap` but allows it in tests; ktlint enforces the `.editorconfig` line length.
- [x] **A3.4 ADRs.** `docs/decisions/` (the `documentation-and-adrs` skill's default location) with a README saying what belongs there versus the spec, `ARCHITECTURE.md` and the FE guide, and the template.

## A4. Hooks (automation that doesn't depend on the model remembering)

- [ ] **A4.1 Format on edit.** `PostToolUse` on Edit/Write: format just the edited file (Prettier / `rustfmt` / `ktlint`). *(needs scaffold)*
- [x] **A4.2 Dangerous-command guard.** `.claude/hooks/guard-bash.js` on Bash and PowerShell, built on the vendored ECC shell parser (subshells, `env`/`command`/`sudo` prefixes, `bash -c`, heredocs, quoting): blocks hook bypasses, destructive pushes (force, `+`/`:` refspecs, delete, mirror, inline git aliases) and recursive deletes outside the repo and temp dir or with an uncheckable target (variables, brace expansion, xargs or `find -exec` shell scripts, pipelines, backtick-escaped or encoded PowerShell, provider drives), following `cd`/`pushd` and stripping `time`/`timeout`/`nohup`-style wrappers. Every other `git push` (or a git command with a variable subcommand) returns an approval prompt to the owner. Prose that only mentions these commands (PR bodies, script arguments) passes.
  - Verified: 12 regression tests (`node --test .claude/hooks/guards.test.js`) covering the cases from three review rounds; live in-session blocks of `git commit -m probe --no-verify`, `(git push --force --dry-run)` and `cd /c/Users && rm -rf …`.
  - Limits (a guardrail against mistakes, not a sandbox): deletes performed by other programs (`node -e "fs.rmSync(…)"`, `npx rimraf`, .NET calls) are not seen; git aliases defined in config files are not expanded. Not verified: whether the approval prompt appears in bypass-permissions mode.
- [x] **A4.3 Protected files.** `.claude/hooks/guard-edit.js` on Write/Edit/MultiEdit/NotebookEdit: secrets and signing material (one definition in `.claude/hooks/lib/secrets.js`: `.env*` except templates, keystores, certificates and private keys, SSH/GPG keys, signing properties, `secrets/`), generated files (under a `generated/` folder, or an `@generated` comment line in the header; T0.4 makes generators follow this), and edits to existing linter/formatter configs (vendored ECC `config-protection.js`, plus `rustfmt`, `clippy`, `detekt`). Edits to the guards and settings themselves prompt the owner (settings `ask` rules).
  - Decision (beyond the original item): keep ECC's linter-config lock, because loosening a lint rule to make a check pass is the shortcut the `auto-commit` gate forbids; creating a config for the first time (T0.2 scaffold) stays allowed.
  - Verified: same test file; a live Edit of a generated file was blocked in-session; the owner confirmed the approval prompts appeared for edits to `.claude/hooks/` and `.claude/settings.json`.
  - Limit: writes through shell commands (`sed -i`, redirection) bypass Edit/Write hooks; read-deny rules and the review gate remain the backstop.
- [x] **A4.4 Session briefing.** The `SessionStart` hook from A0.6.
- [x] **A4.5 Unfinished-work reminder.** `.claude/hooks/stop-reminder.js` on `Stop`. The owner approved building the hooks; the implementer chose remind over block. When Claude stops with uncommitted changes it is nudged to run `auto-commit` or say in one line why the work is not ready: once per new set of changes, never twice for the same set, never in a loop; its own errors never block.
  - Limits: it cannot tell whether the gate already ran (the nudge asks Claude to say so); in a multi-turn task each turn that edits files ends with one nudge.
  - Verified: tests (clean tree silent, nudge once, no repeat for the same changes, silent when already continuing, nudge again on new changes, bad input never blocks); the exact hook command pipe-tested.
- [x] **A4.6 Needs-input notification.** Left to the owner's user-level hooks (Orca), which are registered on `PermissionRequest`, `Stop` and other events; no project hook added, to avoid duplicate notifications. Checked: the event names in `~/.claude/settings.json`; not checked: what the Orca app shows. There is no `Notification` hook, so if idle-wait reminders are missing, add one there.

## A5. QA engineer

- [x] **A5.1 QA review.** Delivered by the `qa-engineer` agent (A1.5) instead of a separate skill: test plan from "Done when" and R-rules, Pulse risk checklist, accessibility, budgets, `docs/qa/<task>.md` with severities, Critical/High/Medium block; uses `break-ui`, `web-design-guidelines`, `playwright-cli`, `playwright-best-practices`. Original plan kept below for reference.
- Original plan: **`qa-review` skill.** Builds a test plan from the task's "Done when" and R-rules; runs automated suites; exploratory checklist for Pulse's risk areas (offline and reconnect, midnight and DST, timezone change, two devices with skewed clocks, sync issues, undo); accessibility pass; performance and size budgets; writes `docs/qa/<task>.md` with findings by severity. Critical, High and Medium findings block the commit (as in `qa-engineer`).
- [ ] **A5.2 E2E tooling skills.** `playwright-cli` (installed) for the web UI; WebdriverIO + `tauri-driver` for desktop; Maestro for Android. Search with `find-skills` for Tauri and Maestro skills. *(needs scaffold)*
- [x] **A5.3 Bug discipline.** `.claude/rules/code-style.md`: every bug fix starts with a failing test that stays; QA bugs are tracked in `docs/qa/<task>.md` and deferred ones in the task ledger until closed.

## A6. DevOps engineer

- [~] **A6.1 CI.** GitHub Actions: lint, type check, tests, builds for server image, Windows installer and Android APK; size budgets checked in CI; required on `main`. Adapt the `ci-cd-and-automation` skill to this stack. *(needs scaffold; T0.3)*
  - Done (T0.3): `.github/workflows/ci.yml` runs every `scripts/check.mjs` group (format, lint, type check, tests, builds, debug APK); its `ci` check is required on `main` by `.github/rulesets/main.json` (D-28). Pending: the server image build with its Dockerfile (T1.3); the Windows installer, signed APK and size budgets (T0.7); adapting the `ci-cd-and-automation` skill to this stack (still generic).
- [ ] **A6.2 `ship` skill.** Version bump, changelog, tag, signed Windows installer, signed APK, server image, release notes, updater manifests. Pushing and publishing only with your explicit approval.
- [~] **A6.3 Secrets and signing.** (Plan done.) `docs/operations/secrets-and-signing.md`: inventory (server secrets, updater key, Windows certificate, Android keystore, CI tokens, legacy credentials) with location, backup, loss and leak consequences; rules for repo, CI, agents, backups and rotation; owner recovery checklist. Concrete locations are filled in when CI and releases exist.
- [ ] **A6.4 Dependency hygiene.** Automated update PRs (Renovate or Dependabot), `cargo audit`, `pnpm audit`, Gradle dependency checks.
- [ ] **A6.5 Self-host operations.** Backup/restore runbook, health checks, logs (the `observability-and-instrumentation` skill).

## A7. Skills, MCP servers and docs access

- [x] **A7.1 Skill search.** Searched skills.sh for every checklist need (2026-10-24); 18 repos reviewed without running anything; installed and rejected items are in the sourcing table above and `.claude/THIRD_PARTY.md`. Deferred to T0.2 (they need code): the Maestro skill (adapted) and the official `android-cli` skill.
- [~] **A7.2 MCP servers.** Owner chose the official Svelte MCP: added as the remote HTTP server `https://mcp.svelte.dev/mcp` in `.mcp.json` (project scope, nothing runs locally) and pre-approved in `.claude/settings.json`. graphify (A0.4) comes after T0.2; Context7 and a Postgres MCP not added.
- Original plan: **A7.2 MCP servers.** Candidates: the official Svelte MCP (current docs + autofixer), Context7 (current library docs; overlaps the `source-driven-development` skill), Serena (A0.4), a read-only Postgres MCP for the dev database. `gh` CLI covers GitHub.
- [ ] **A7.3 Fewer permission prompts.** After a few working sessions, run the `fewer-permission-prompts` skill to tune the allowlist.

## A8. Validate the setup

- [ ] **A8.1 Dry run.** Push one real spec task through the full pipeline (A1.7) and fix whatever the setup gets wrong.
- [ ] **A8.2 Showcase.** A short "How this repo is built with agents" section (README or this file) describing the roles, the pipeline, the FE-guide loop and the memory, so others can learn from it.

---

## Suggested order

1. A0.1 → A0.2 → A0.3 (environment basics, small)
2. A3.1 → A2.1 → A2.2 → A2.3 (architecture and the FE guide loop: shape everything after)
3. A1.1–A1.6 → A1.7 → A1.8 (roles and pipeline)
4. A4.2 → A4.3 → A4.5 → A4.6 (guards that work before code exists)
5. A0.4 → A0.5 → A0.6/A4.4 (memory and token efficiency)
6. A5.1, A6.2, A6.3, A7.1, A7.2 (QA, shipping, discovery)
7. After T0.2 scaffold: A2.4, A2.5, A3.3, A4.1, A5.2, A6.1, A6.4, A7.3
8. A8.1 → A8.2
