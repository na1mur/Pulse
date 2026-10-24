# ADR-0002: UI primitives live inside the desktop app

## Status
Proposed

## Date
2026-10-24

## Context
The design system's components (spec 10.4) are built twice: in Svelte for desktop and in Compose for Android (spec section 11). Only one Svelte app exists. Tokens are shared through `packages/tokens`.

## Decision
Keep the Svelte primitives in `apps/desktop/src/lib/ui`, not in a separate `packages/ui`. Share design tokens, not components.

## Alternatives considered

### `packages/ui`
- Pros: clear boundary; reusable if a second Svelte app (e.g. a web client) appears.
- Cons: extra package, build and versioning for a single consumer.
- Rejected for now: no second consumer exists; the browser extension has almost no UI.

## Consequences
Less setup. If a web client (spec 12.9 backlog) is built, move the primitives into a package and supersede this ADR.
