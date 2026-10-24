# Architecture decision records

For decisions too detailed for the spec but worth explaining later: a library choice inside a layer, a data-structure trade-off, a deliberate deviation from a skill's advice. Product rules and stack choices stay in `docs/REBUILD_SPEC.md` (sections 3, 11, 13); folder and layering rules in `docs/ARCHITECTURE.md`; design and UI decisions in `docs/FE_GUIDE.md`.

Format: the `documentation-and-adrs` skill's template. Files are numbered `NNNN-short-title.md` (`0001-...`). Status moves Proposed → Accepted → Superseded/Deprecated; never delete an ADR, supersede it. Reference the spec IDs the decision touches.

```markdown
# ADR-NNNN: <decision in a few words>

## Status
Proposed | Accepted | Superseded by ADR-XXXX | Deprecated

## Date
YYYY-MM-DD

## Context
<the forces at play, citing spec IDs>

## Decision
<what we do>

## Alternatives considered
<each with pros, cons, why rejected>

## Consequences
<what gets easier, what gets harder, what to watch>
```
