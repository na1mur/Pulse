---
paths:
  - "apps/server/**"
  - "apps/desktop/src/**"
  - "packages/**"
---

# TypeScript in Pulse

Structure: `docs/ARCHITECTURE.md`. On top of that:

- `strict` TypeScript. No `any`, no non-null `!` without a comment saying why it is safe; use `unknown` and narrow.
- Types at boundaries come from `packages/contract` (generated). Never hand-write a type that duplicates a contract type.
- Validate untrusted input with the contract's zod schemas at the boundary; inside, trust the types.
- Errors: return or throw typed errors that map to the contract error model (spec 7.1); never swallow an error or log-and-continue silently.
- Prefer pure functions and `const`; no mutation of arguments; no module-level mutable state except deliberate stores.
- Dates and durations: integer seconds and ISO instants; formatting only through `lib/format` (UI) or the domain helpers (server); never `toLocaleDateString` ad hoc.
- Tests next to the code (`*.spec.ts` / `*.test.ts`), Vitest; test behaviour through public functions. General naming, size, comment and test rules: `code-style.md`.
- No `console.log` left in committed code; use the logger (server) or remove it.
