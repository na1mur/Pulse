# Pulse frontend guide

The single place for how Pulse looks and behaves, on desktop (Svelte) and Android (Compose). It grows with every design or flow decision the owner makes, so the same kind of component is always built the same way.

**How it is used**
- Before building or changing UI, read the sections for the components and patterns involved. A rule here is binding.
- A question this guide does not answer is a decision for the owner: run the `design-decision` skill. Never pick a new pattern silently.
- Each owner decision gets a row in the decision log (section 10) **and** a short rule in the matching section, citing its `FE-NNN` ID.
- Rules taken from the spec cite the spec ID instead of repeating its detail (`docs/REBUILD_SPEC.md` section 10 and the rules it references).

Status: skeleton, 2026-10-24. Only spec-derived rules so far; no owner decisions yet.

## 1. Principles

- Timer first: the timer is visible on every screen and starting is instant (spec principle 5, TIM-09).
- Restraint: hierarchy from size, weight and space; no per-card glows or heavy blur; one focal accent on the running timer at most (spec 10.4).
- Nothing fails silently: every failure is visible as a toast, banner or sync issue (spec principle 6).
- Desktop and Android share tokens, patterns and wording (spec 10.4 "semantic tokens from one source", MOB-01 "sharing the client core"); where platform conventions differ, section 9 says how.

## 2. Design tokens

- Colours, spacing, type, radii, elevation and motion come from one token source (`packages/tokens`) that generates the CSS variables and the Compose theme (spec 10.4, A2.4). Components never use raw values.
- Brand violet `#7C3AED` is the accent token; text uses its AA-compliant variant (spec 10.4, 9.4).
- Spacing on a 4 px grid; comfortable and compact density (spec 10.4).
- One type family; tabular numerals for every time display; at most two weights per view (spec 10.4).
- Light and dark themes from the same tokens, applied before first paint (SET-01, spec 10.4).

_Owner decisions:_ none yet (palette roles beyond the brand colour, type family, radii, motion durations are open).

## 3. Component catalogue

Components to own (spec 10.4): Button (incl. solid destructive), IconButton, Input, Textarea, DurationInput, Select/Combobox (tag picker with search and create), Switch, Checkbox, SegmentedControl, Dialog, Drawer, Popover, Toast (with actions), Tooltip, TagChip (with colour), ProgressRing/Bar, List/Table (virtualised), EmptyState, Skeleton, Banner.

For each component, record here once decided: variants, sizes, states (default, hover, focus, active, disabled, loading, error), keyboard behaviour, and the desktop vs Android mapping.

_Owner decisions:_ none yet.

## 4. Layout and navigation

- Timer-first shell: persistent timer bar plus four destinations (Today, Log, Insights, Settings); Goals opens as a drawer (spec 10.1).
- Navigation keeps per-screen state and remembers the last screen (spec 10.1).
- Minimum desktop window about 480x640; layout adapts to width (spec 10.4).

_Owner decisions:_ none yet.

## 5. Patterns

### 5.1 Feedback: toasts, banners, sync issues
- Stop saves immediately; a toast offers Add note and Undo for 10 s (R-06, TIM-03, Appendix A).
- Goal reached: toast plus native notification, once per period (GOAL-05, NOTIF-01).
- Sync status dot with pending count; rejected changes become sync issues (SYNC-04, R-36).

### 5.2 Confirmations and undo
- No blocking dialog before or after tracking (spec principle 5, R-06).
- Prefer undo over confirmation; confirm only where undo is impossible (spec 10.2 overlays).

### 5.3 Loading, empty, error and offline states
- Every screen has loading, empty and error states with retry; offline keeps working (spec 10.2, 10.3, SYNC-03).

### 5.4 Forms and validation
- Inline field errors; overlap conflicts explained inline with the conflicting session (spec 10.3, R-05).

### 5.5 Lists and tables
- Log grouped by day with sticky headers and day totals; virtualised (LOG-01, spec 10.2).

### 5.6 Time and number display
- Clocks `H:MM:SS`, summaries `Xh Ym` rounded down, never negative (R-18).
- Correct plurals; one date/time format system following the 12/24 h and locale settings (spec 10.4, SET-03).

_Owner decisions:_ none yet.

## 6. Behaviour rules

- Optimistic UI: start/stop feedback under 100 ms (TIM-01, spec 9.3).
- Only the clock redraws every second (spec 9.3).
- Timer state changes and sync status are announced politely; never every second (spec 9.4).

## 7. Accessibility

WCAG 2.2 AA baseline (X-01, spec 9.4): dialog roles and focus management, everything keyboard-operable, visible focus, selection never by colour alone, touch targets at least 44 px on mobile (spec 9.4; 48 dp per Material 3, `.claude/references/ux/android.md`), reduced motion honoured, charts with a data-table alternative.

_Owner decisions:_ none yet (desktop pointer-target size is open).

## 8. Copy and voice

Copy deck: spec Appendix B. Placeholders "What are you working on?" and "What did you accomplish?". Strings are externalised (SET-06).

_Owner decisions:_ none yet (tone beyond the copy deck is open).

## 9. Desktop vs Android

- Desktop: tray, global shortcut, mini window (DESK-*); keyboard-first.
- Android: Material 3 navigation, predictive Back, edge-to-edge insets, 48 dp targets (`.claude/references/ux/android.md`); the ongoing notification shows the timer (MOB-02).

_Owner decisions:_ none yet.

## 10. Decision log

| ID | Date | Decision | Options considered | Chosen | Applies to |
|---|---|---|---|---|---|

## 11. Open questions

Decisions noticed but not yet put to the owner (for example when working unattended). Each moves to the decision log once answered.

| Question | Where it came up | Options so far |
|---|---|---|
