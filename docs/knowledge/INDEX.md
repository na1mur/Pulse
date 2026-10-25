# Knowledge index

Start here to find a fact without reading whole files. Each line says where a kind of knowledge lives; the notes below hold non-obvious facts that are recorded nowhere else.

## Where things live

| Question | Source |
|---|---|
| What must the product do? Rules, features, tasks, open decisions | `docs/REBUILD_SPEC.md` via `node scripts/spec.mjs <ID>` |
| What did the owner ask for, in their words? User stories and ACs | `docs/product/PRD.md` via `node scripts/spec.mjs US-x.y` (input to the spec; the spec says where it differs, section 4.3) |
| How is the code organised, what may depend on what? | `docs/ARCHITECTURE.md` |
| How does the UI look and behave? Owner's design decisions | `docs/FE_GUIDE.md` (decision log: section 10) |
| Why was a technical choice made? | `docs/decisions/` (ADRs) |
| What is done, in progress, deferred? | `docs/tasks/LEDGER.md`, task files in `docs/tasks/` |
| What did QA find? | `docs/qa/<task-id>.md` |
| How is the agent setup built, and why? | `docs/AGENTIC_SETUP.md` |
| Where did a skill, agent or hook come from? | `.claude/THIRD_PARTY.md` |
| Where do secrets and signing keys live, and what if one is lost? | `docs/operations/secrets-and-signing.md` |
| What does CI run, and what protects `main`? | `.github/workflows/ci.yml` (one job per `scripts/check.mjs` group, aggregate `ci` check); `.github/rulesets/main.json` (bypass actor 5 = repository admin role, integration 15368 = GitHub Actions; create with `gh api -X POST repos/na1mur/Pulse/rulesets --input .github/rulesets/main.json`, update the live one (id 25812351) with `gh api -X PUT repos/na1mur/Pulse/rulesets/25812351 --input .github/rulesets/main.json`); D-28 |
| Shared time/streak/credit fixtures (D-19): format, conventions, how values were verified | `packages/contract/fixtures/README.md`; TS loader `@pulse/contract/fixtures/time`; time-math decisions in ADR-0004 |
| How to work in this repo | `CLAUDE.md`, path-scoped `.claude/rules/` |
| Code structure and call paths | graphify (after T0.2, A0.4) |

## Notes

- [[agent-tooling-gotchas]]: things about Claude Code and this Windows machine that cost time once.
- [[vitest-module-cache]]: Vitest's on-disk cache ignores tsconfig changes, so every package turns it off.
- [[workspace-package-sources]]: checks run against workspace packages' sources; a consumer's Vitest config needs the `@pulse/source` condition.

## Adding a note

Write a note only for a durable, non-obvious fact that has no better home (a product rule goes in the spec, a design choice in the FE guide, a technical choice in an ADR). One topic per file in `docs/knowledge/`, a few lines, linked here as `[[name]]` with a one-line hook. Update or delete notes that stop being true.
