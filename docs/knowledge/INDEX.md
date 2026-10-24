# Knowledge index

Start here to find a fact without reading whole files. Each line says where a kind of knowledge lives; the notes below hold non-obvious facts that are recorded nowhere else.

## Where things live

| Question | Source |
|---|---|
| What must the product do? Rules, features, tasks, open decisions | `docs/REBUILD_SPEC.md` via `node scripts/spec.mjs <ID>` |
| How is the code organised, what may depend on what? | `docs/ARCHITECTURE.md` |
| How does the UI look and behave? Owner's design decisions | `docs/FE_GUIDE.md` (decision log: section 10) |
| Why was a technical choice made? | `docs/decisions/` (ADRs) |
| What is done, in progress, deferred? | `docs/tasks/LEDGER.md`, task files in `docs/tasks/` |
| What did QA find? | `docs/qa/<task-id>.md` |
| How is the agent setup built, and why? | `docs/AGENTIC_SETUP.md` |
| Where did a skill, agent or hook come from? | `.claude/THIRD_PARTY.md` |
| How to work in this repo | `CLAUDE.md`, path-scoped `.claude/rules/` |
| Code structure and call paths | graphify (after T0.2, A0.4) |

## Notes

- [[agent-tooling-gotchas]]: things about Claude Code and this Windows machine that cost time once.

## Adding a note

Write a note only for a durable, non-obvious fact that has no better home (a product rule goes in the spec, a design choice in the FE guide, a technical choice in an ADR). One topic per file in `docs/knowledge/`, a few lines, linked here as `[[name]]` with a one-line hook. Update or delete notes that stop being true.
