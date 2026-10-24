---
paths:
  - "docs/REBUILD_SPEC.md"
---

# Editing the rebuild spec

- **IDs are permanent.** Never renumber or reuse an existing ID (`R-`, `D-`, `T`, `WS`, feature IDs). New items take the next free number; removed items are marked removed, not deleted, if anything referenced them. *One recorded exception (2026-10-24):* section 12 was re-planned from the owner's PRD before any task above T0.7 had started, so the old M1-M6 task IDs (T1.x-T6.x) were reused (T7.x is new); the old plan is at commit `689caa1`.
- **Define once, reference everywhere.** A concept's definition lives in one row (section 3 for rules). Other sections cite the ID instead of restating it.
- **Every new rule or feature is reachable from a task** (section 12), and every task cites the features, rules and user stories it delivers.
- **User stories (`US-x.y`) live in `docs/product/PRD.md`,** the owner's words: never change its content (only the header note may say where answers were recorded). Every story is cited by at least one feature or rule; when the spec meets a story differently from its wording, record why in section 4.3 and, if it was the owner's call, in section 13.
- **Decisions:** mark them "**Decided** <YYYY-MM-DD>" or "proposed"; when one changes, update the decision record (section 11) and the open-decisions table (section 13) together, and fix every rule that cites it.
- Use absolute dates, never "today" or "next week".
- Product rules stay storage- and framework-agnostic outside section 11; implementation detail belongs in ADRs or `docs/ARCHITECTURE.md`.
- Before committing, run `bash scripts/check-docs.sh`; it must print `docs OK`.
