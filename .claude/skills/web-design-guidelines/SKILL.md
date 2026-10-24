---
name: web-design-guidelines
description: Audit Pulse's desktop UI code (Svelte in Tauri) against Vercel's Web Interface Guidelines - accessibility, focus, forms, motion, typography, long content, performance, theming, locale - with terse file:line findings. Use when reviewing or QA-ing desktop UI changes, or when asked to audit UI/UX or accessibility of the Svelte app.
---

# Web Interface Guidelines audit

> Adapted from vercel-labs/agent-skills `web-design-guidelines` (MIT). Pulse changes: the rules are pinned in `references/guidelines.md` (vercel-labs/web-interface-guidelines @434b7f9) instead of fetched at runtime, so nothing unreviewed is loaded; Pulse-specific applicability notes below.

## How it works

1. Read `references/guidelines.md` (the rules and the output format).
2. Read the files to review (a path or pattern from the caller; otherwise the uncommitted Svelte/CSS changes under `apps/desktop/src/`).
3. Check them against every applicable rule; output findings grouped by file in the `file:line` format the guidelines specify.

## Applicability in Pulse

- **The FE guide (`docs/FE_GUIDE.md`) wins.** Where a rule is a style choice the guide has not made yet (Title Case vs sentence case, curly quotes, `&` vs "and", voice), report it under a final `## Open questions for the FE guide` heading instead of as a violation; the main session raises it through `design-decision`.
- **Skip** rules that cannot apply to a Tauri single-window app: hydration safety, server/client mismatch, URL/query-param state and deep links, `<link rel="preconnect">` to CDNs, `fetchpriority`/lazy images from the network, `Accept-Language` detection, `safe-area-inset` notches.
- **React-specific syntax** in the rules (`onKeyDown`, `htmlFor`, `spellCheck`, `autoFocus`) maps to the Svelte equivalents (`onkeydown`, `for`, `spellcheck`, `autofocus`).
- Spec rules that already cover a topic are cited instead (tabular numerals: spec 10.4; destructive actions use undo: spec 10.2; virtualised lists: LOG-01; `Intl` formatting: `lib/format`).
- Android (Compose) is out of scope here; use `.claude/references/ux/android.md` and `mobile-android-design` for it.
