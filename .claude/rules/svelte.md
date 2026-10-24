---
paths:
  - "apps/desktop/src/**"
---

# Svelte desktop UI

Use `svelte5-best-practices` (runes, snippets) and `frontend-ui-engineering`; **the FE guide (`docs/FE_GUIDE.md`) wins** over both on any design or behaviour question. Structure: `docs/ARCHITECTURE.md` section 3.

- Before building or changing UI, read the FE guide sections for the components and patterns involved and reuse an existing pattern when one fits. A design or flow question the guide does not answer is not yours to decide: run the `design-decision` skill.
- Use `lib/ui` primitives and design tokens only: no raw colours, spacing, font sizes or z-index values in components. The brand colour is the violet token, whatever generic guidance says about purple.
- Talk to the backend only through `lib/core` (Tauri commands and events). No `fetch` to the server from the UI.
- State: runes in the component or a feature store; derived values with `$derived`, never `$effect` to sync state.
- Every screen handles loading, empty, error and offline states (spec 10.2) and the running-timer case.
- Accessibility (WCAG 2.2 AA): semantic elements, labels, visible focus, keyboard paths, no colour-only signals, honour reduced motion. Only the clock text updates every second (spec 9.3).
- Tests: Vitest for logic and components; check changed UI in light and dark themes with the `playwright-cli` skill against the dev server before handing off; stress it with `break-ui`.
