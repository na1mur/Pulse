---
paths:
  - "apps/**"
  - "crates/**"
  - "packages/**"
---

# Code style for all Pulse code

Language idioms come from the stack skills and the per-language rules; these apply everywhere.

- **Match the surrounding code**: its naming, structure, comment density and idioms. Consistency beats personal preference.
- **Names say what a thing is or does** in domain terms (`workedSeconds`, `dayKey`, `startSession`), units in the name when not obvious (`timeoutMs`). No abbreviations beyond common ones (`id`, `url`, `ms`).
- **Small units**: a function does one thing and fits on a screen (about 40 lines); a file past about 300 lines usually holds two responsibilities and should be split. Judgement, not a hard limit.
- **Comments explain why**, not what: intent, invariants, spec IDs (`// R-11: clip at local midnight`), and the reason behind anything surprising. No commented-out code, no TODO without an owner or task ID.
- **No speculative generality**: build what the current task's spec rows need; no options, hooks or abstractions for imagined futures.
- **Errors are values or typed exceptions**, never swallowed; every error reaches the user-facing feedback layer or a log with context.
- **Tests**: written first for logic (TDD skill), named after the behaviour they prove, independent of each other, deterministic (fake clock, no real network, no sleeps). Fixtures shared across implementations live in one place (proposed: `packages/contract/fixtures/`, open decision D-19).
- **Dependencies** need a reason: size budgets (spec 9.3) and maintenance cost count.
