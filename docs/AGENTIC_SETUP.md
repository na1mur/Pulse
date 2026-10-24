# Agentic setup checklist

Goal: make Pulse an exemplary agentic-coding project. Work flows the way a senior team would run it: a **UI/UX designer** designs, senior **frontend** and **backend** engineers build, test and debug, a **QA engineer** reviews, and a **DevOps engineer** ships. Every step is backed by skills, rules, subagents and hooks in this repo.

How to use this file:
- Work through items **one at a time**, in the suggested order (bottom of the file). Each item: settle its decision (if any) → build it → verify it → tick it with the commit hash.
- Items marked *(needs scaffold)* can only be finished after T0.2 creates the code layout; their rules/agents can be drafted earlier.
- Status: `[ ]` open · `[~]` in progress · `[x]` done (commit).

## Already in place

- [x] `CLAUDE.md` with spec navigation and architecture invariants (`bff9d75`, `8841e9b`)
- [x] `auto-commit` skill: verify → run → debug → commit gate (`bff9d75`)
- [x] 13 agent-skills skills (TDD, debugging, incremental implementation, API design, frontend UI, security, performance, code review, planning, ADRs, CI/CD, observability, source-driven development) (`e462d4e`)
- [x] Stack decided and recorded in the spec (`8841e9b`)

---

## A0. Agent environment foundations

- [x] **A0.1 Make `find-skills` visible to Claude Code.** It was installed in `~/.agents/skills/` (the `npx skills` location), which Claude Code does not read.
  - Decided: copied into this repo (`.claude/skills/find-skills/`); **everything for Pulse is project-local, nothing user-level**. Adapted to install project-locally and read every skill before installing it.
- [ ] **A0.2 Project settings.** `.claude/settings.json` (committed): permission allowlist for build/test commands, deny list (reading `.env`/keystores, force push, `--no-verify`); `.claude/settings.local.json` for personal overrides; a root `.gitignore` (the repo has none since the legacy app was removed).
  - Note: user-level Orca hooks already exist; project hooks add to them.
  - Done when: common commands run without prompts; denied actions are blocked.
- [ ] **A0.3 Path-scoped rules.** `.claude/rules/*.md` with `paths:` frontmatter, so each rule loads only when files it covers are touched. Keeps `CLAUDE.md` short and saves tokens.
  - Done when: `CLAUDE.md` holds only repo-wide guidance; area guidance lives in rules.
- [ ] **A0.4 Agent memory / knowledge graph.** A project memory that lets an agent find relevant facts without rereading large files.
  - Options: (a) **in-repo knowledge base** `docs/knowledge/`: an `INDEX.md` map plus small linked notes (`[[note]]`), git-tracked and shared across machines; (b) **MCP memory server** storing an entity/relation graph in a repo JSON file; (c) **Serena MCP**: symbol-level code navigation through language servers (TypeScript, Rust, Kotlin), so agents read functions instead of whole files.
  - Recommendation: (a) for decisions and project facts + (c) for code, once code exists. Claude Code's built-in per-machine memory stays for personal preferences.
  - Done when: an agent answers "where is X / why is Y" by reading the index and one or two notes.
- [ ] **A0.5 Token-efficient spec access.** The spec is ~70 KB; agents should read only the parts they need.
  - Options: (a) a lookup script/skill (`spec R-42`, `spec T1.4`, `spec §8.3`) that prints just those rows or sections; (b) split the spec into `docs/spec/*.md` with an index.
  - Recommendation: (a): keeps one file, no broken references.
  - Done when: implementing a task needs no full read of the spec.
- [ ] **A0.6 Session-start briefing.** A `SessionStart` hook that prints a ~30-line "current state": current milestone, next open tasks, open decisions, pointers to the knowledge index. Generated from the spec and this file, not hand-maintained.

## A1. Role agents and the delivery pipeline

Subagents live in `.claude/agents/`; each has a focused system prompt, a restricted tool set and the skills/rules it must follow.

- [ ] **A1.1 `ux-designer`.** Owns the FE guide (A2), user flows and screen specs. Produces a design spec (and, for visual questions, a mockup artifact) **before** any UI code. Never decides a new pattern silently: uses the `design-decision` skill (A2.3). Writes only in `docs/design/` and the FE guide.
- [ ] **A1.2 `frontend-engineer`.** Builds Svelte (desktop) and Compose (Android) UI from the design spec and FE guide; TDD for logic, screenshot check for visuals (A2.5).
- [ ] **A1.3 `backend-engineer`.** NestJS modules, database schema and migrations, contract package; integration tests against a real database.
- [ ] **A1.4 `core-engineer`.** Rust client core, Tauri native side, Android foreground service and trackers. Decision: a separate agent (recommended: different language and failure modes) or part of `backend-engineer`.
- [ ] **A1.5 `qa-engineer`.** Reviews finished work against the spec's "Done when" and R-rules; runs automated suites and exploratory checks; files findings with severity. May write tests, never product code. Details in A5.
- [ ] **A1.6 `devops-engineer`.** CI, release builds, signing, server image, update channels. Details in A6.
- [ ] **A1.7 Delivery pipeline skill (`/task T1.4`).** Runs one spec task end to end: brief (spec rows + knowledge) → design (A1.1, asks you when needed) → plan → build (A1.2–A1.4) → verify (`auto-commit` gate) → QA review (A1.5) → fix loop → commit.
  - Decision: a sequential skill that delegates to subagents (cheaper, recommended) or a multi-agent Workflow for large tasks (on request only).
- [ ] **A1.8 Senior code review in the gate.** Run the `code-review-and-quality` skill (or built-in `/code-review`) on non-trivial diffs before `auto-commit` commits. Decision: always, or only above a diff-size threshold.

## A2. Frontend guide and the design-decision loop

- [ ] **A2.1 `docs/FE_GUIDE.md` skeleton.** Sections: principles · tokens (reference, not values) · component catalogue · patterns (forms, lists, loading/empty/error, toasts and undo, confirmations, navigation, notifications) · behaviour rules (optimistic UI, keyboard, focus) · accessibility · copy and voice · desktop vs Android differences · **decision log** (`FE-001`, …). Seeded from spec section 10 by reference, not duplication.
- [ ] **A2.2 Frontend rule.** `.claude/rules/frontend.md`, scoped to the desktop UI and Android UI paths: read the relevant FE guide sections before building UI; reuse an existing pattern when one fits; if a design or flow decision is not covered, stop and run `design-decision`.
- [ ] **A2.3 `design-decision` skill.** For any design/flow choice not covered by the guide: ask you with 2–4 options (with ASCII previews, or a mockup artifact for visual choices), mark a recommendation, apply your choice, then record it in the guide: a decision-log entry (`FE-xxx`: context, options, choice, date) **and** the reusable rule in the matching pattern section. Next time the same kind of component or logic is needed, the rule applies without asking.
- [ ] **A2.4 One source of design tokens.** A tokens file that generates both the desktop CSS variables and the Compose theme; lint against hard-coded colours, spacing and font sizes. *(needs scaffold; overlaps T1.7)*
- [ ] **A2.5 Visual verification.** UI changes are checked with screenshots in light and dark themes (the `playwright-cli` skill for the Svelte UI in a browser; the running app for Tauri and Android). *(needs scaffold)*

## A3. Engineering standards (clean code and architecture)

- [ ] **A3.1 `docs/ARCHITECTURE.md`.** Monorepo folder structure; module boundaries and allowed dependency directions (contract → server/core; core has no UI dependency; apps depend on core); layering inside each part: NestJS (module → controller → service → repository, pure domain logic), Rust core (pure domain, ports and adapters for clock/storage/transport), Svelte app (features / UI kit / lib), Kotlin (feature packages, UI / data).
- [ ] **A3.2 Per-language rules** in `.claude/rules/`, path-scoped: `typescript.md`, `nestjs.md`, `svelte.md`, `rust.md`, `kotlin.md`. Naming, error handling, no `any`/`unwrap` in production paths, function and file size limits, purity, comment policy, test style.
- [ ] **A3.3 Enforce with tools, not prose.** Prettier + ESLint (with import-boundary rules), `rustfmt` + `clippy` (warnings denied), `ktlint` + `detekt`, and an architecture-boundary check (dependency-cruiser or ESLint boundaries). *(needs scaffold; part of T0.2)*
- [ ] **A3.4 ADRs.** `docs/adr/` for decisions too detailed for the spec, using the `documentation-and-adrs` skill; the spec stays the source of truth for product rules.

## A4. Hooks (automation that doesn't depend on the model remembering)

- [ ] **A4.1 Format on edit.** `PostToolUse` on Edit/Write: format just the edited file (Prettier / `rustfmt` / `ktlint`). *(needs scaffold)*
- [ ] **A4.2 Dangerous-command guard.** `PreToolUse` on Bash: block `--no-verify`, force push, `git push` without an explicit request, recursive deletes outside the repo.
- [ ] **A4.3 Protected files.** `PreToolUse` on Edit/Write: block secrets (`.env`, keystores, signing keys) and generated files (contract outputs: "edit the schema instead").
- [ ] **A4.4 Session briefing.** The `SessionStart` hook from A0.6.
- [ ] **A4.5 Unfinished-work reminder.** `Stop` hook: if files changed since the last commit and the gate hasn't run, remind to run `auto-commit`. Decision: remind, or block stopping until the gate runs.
- [ ] **A4.6 Needs-input notification.** Windows toast when Claude is waiting for you. Check first whether the existing Orca hooks already do this.

## A5. QA engineer

- [ ] **A5.1 `qa-review` skill.** Builds a test plan from the task's "Done when" and R-rules; runs automated suites; exploratory checklist for Pulse's risk areas (offline and reconnect, midnight and DST, timezone change, two devices with skewed clocks, sync issues, undo); accessibility pass; performance and size budgets; writes `docs/qa/<task>.md` with findings by severity. High-severity findings block the commit.
- [ ] **A5.2 E2E tooling skills.** `playwright-cli` (installed) for the web UI; WebdriverIO + `tauri-driver` for desktop; Maestro for Android. Search with `find-skills` for Tauri and Maestro skills. *(needs scaffold)*
- [ ] **A5.3 Bug discipline.** Every bug fix starts with a failing test (TDD skill); bugs found by QA are tracked in the QA report until closed.

## A6. DevOps engineer

- [ ] **A6.1 CI.** GitHub Actions: lint, type check, tests, builds for server image, Windows installer and Android APK; size budgets checked in CI; required on `main`. Adapt the `ci-cd-and-automation` skill to this stack. *(needs scaffold; T0.3)*
- [ ] **A6.2 `ship` skill.** Version bump, changelog, tag, signed Windows installer, signed APK, server image, release notes, updater manifests. Pushing and publishing only with your explicit approval.
- [ ] **A6.3 Secrets and signing.** Signing keys and tokens outside the repo (CI secrets, offline backup of the Android key); documented recovery.
- [ ] **A6.4 Dependency hygiene.** Automated update PRs (Renovate or Dependabot), `cargo audit`, `pnpm audit`, Gradle dependency checks.
- [ ] **A6.5 Self-host operations.** Backup/restore runbook, health checks, logs (the `observability-and-instrumentation` skill).

## A7. Skills, MCP servers and docs access

- [ ] **A7.1 Skill search.** With `find-skills`, search for Svelte 5, Tauri 2, Rust, Kotlin/Compose, NestJS, PostgreSQL, Maestro, GitHub Actions. Read each candidate before installing; install only what adds knowledge the agents lack.
- [ ] **A7.2 MCP servers.** Candidates: the official Svelte MCP (current docs + autofixer), Context7 (current library docs; overlaps the `source-driven-development` skill), Serena (A0.4), a read-only Postgres MCP for the dev database. `gh` CLI covers GitHub.
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
