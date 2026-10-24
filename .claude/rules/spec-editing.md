---
paths:
  - "docs/REBUILD_SPEC.md"
---

# Editing the rebuild spec

- **IDs are permanent.** Never renumber or reuse an existing ID (`R-`, `D-`, `T`, `WS`, feature IDs). New items take the next free number; removed items are marked removed, not deleted, if anything referenced them.
- **Define once, reference everywhere.** A concept's definition lives in one row (section 3 for rules). Other sections cite the ID instead of restating it.
- **Every new rule or feature is reachable from a task** (section 12), and every task cites the features and rules it delivers.
- **Decisions:** mark them "**Decided** <YYYY-MM-DD>" or "proposed"; when one changes, update the decision record (section 11) and the open-decisions table (section 13) together, and fix every rule that cites it.
- Use absolute dates, never "today" or "next week".
- Product rules stay storage- and framework-agnostic outside section 11; implementation detail belongs in ADRs or `docs/ARCHITECTURE.md`.
- Before committing, run `bash scripts/check-docs.sh`; it must print `docs OK`.
