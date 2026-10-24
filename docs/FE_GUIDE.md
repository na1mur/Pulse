# Pulse frontend guide

The single place for how Pulse looks and behaves, on desktop (Svelte) and Android (Compose). It grows with every design or flow decision the owner makes, so the same kind of component is always built the same way.

**How it is used**
- Before building or changing UI, read the sections for the components and patterns involved. A rule here is binding.
- A question this guide does not answer is a decision for the owner: run the `design-decision` skill. Never pick a new pattern silently.
- Each owner decision gets a row in the decision log (section 10) **and** a short rule in the matching section, citing its `FE-NNN` ID.
- Rules taken from the spec cite the spec ID instead of repeating its detail (`docs/REBUILD_SPEC.md` section 10 and the rules it references). The owner's PRD (`docs/product/PRD.md`, `US-x.y`) is the source of FE-001..FE-009.

Status: 2026-10-24. Spec-derived rules plus the UI decisions the owner made in the PRD (FE-001..FE-009); palette values, type, radii, motion and component details are still open.

## 1. Principles

- The timer comes first: starting and pausing act on the press, and the timer is visible on every screen (spec principle 5, TIM-09).
- Productive hours lead: wherever time is summarised, productive time is the most prominent number (FE-006, R-51).
- Restraint: hierarchy from size, weight and space; no per-card glows or heavy blur; one focal accent on the running timer at most (spec 10.4).
- Nothing fails silently: every failure is visible as a toast, banner or sync issue (spec principle 6).
- Desktop and Android share tokens, patterns and wording (spec 10.4, MOB-01); where platform conventions differ, section 9 says how.

## 2. Design tokens

- Colours, spacing, type, radii, elevation and motion come from one token source (`packages/tokens`) that generates the CSS variables and the Compose theme (spec 10.4, A2.4). Components never use raw values.
- Brand violet `#7C3AED` is the accent token; text uses its AA-compliant variant (spec 10.4, 9.4).
- Category colours are tokens: Productive green, Leisure orange, Neutral blue, each with light and dark values that meet contrast on their surfaces (FE-002).
- Negative credit balances use the danger token (FE-005).
- Spacing on a 4 px grid; comfortable and compact density (spec 10.4).
- One type family; tabular numerals for every time and credit display; at most two weights per view (spec 10.4).
- Light and dark themes from the same tokens, applied before first paint (SET-01, spec 10.4).

_Owner decisions:_ FE-002, FE-005. Still open: exact palette values (including the category greens, oranges and blues), type family, radii, motion durations.

## 3. Component catalogue

Components to own (spec 10.4): Button (incl. solid destructive), IconButton, Input, Textarea, DurationInput, Select/Combobox (tag picker with search and create), Switch, Checkbox, SegmentedControl, Dialog (incl. the session dialog), Drawer, Popover, Toast (with actions), Tooltip, TagChip, ProgressBar, List/Table (virtualised), EmptyState, Skeleton, Banner; charts: stacked bars with a reference line, day timeline, calendar heatmap, line chart.

- **TagChip:** the tag's name on or next to its category colour; never the category name (FE-001).
- **Session dialog** (start and summary): visible 5 s countdown, cancelled by any interaction (FE-003, R-48).
- **Tag picker:** active tags only, in category colours, with "+ New tag" (name + category) inline (TAG-02, R-07).

For each component, record here once decided: variants, sizes, states (default, hover, focus, active, disabled, loading, error), keyboard behaviour, and the desktop vs Android mapping.

_Owner decisions:_ FE-001, FE-003.

## 4. Layout and navigation

- Timer-first shell with four destinations: Today, History, Stats, Settings; a persistent timer bar on every screen except Today (spec 10.1).
- Main screen content is fixed by FE-004; which timer is larger is open (D-02, section 11 below).
- Settings sections follow US-12.1 in that order; device-only sections are labelled as "this device".
- Navigation keeps per-screen state and remembers the last screen (spec 10.1).
- Minimum desktop window about 480x640; layout adapts to width (spec 10.4).

_Owner decisions:_ FE-004.

## 5. Patterns

### 5.1 Feedback: toasts, banners, sync issues
- Goal reached: native notification on every device once, plus an in-app toast when the app is open (NOTIF-01, GOAL-05).
- "Offline – will sync" shows while changes are queued; rejected changes become sync issues (FE-009, SYNC-04, R-36).
- Credit low / zero / below-zero and game-suggestion alerts are native notifications, never in-app blockers (R-46, ACT-03).

### 5.2 Dialogs, confirmations and undo
- Start and pause act at the press; their dialogs never block and never move the times (R-06, R-07, FE-003).
- Destructive actions confirm, and the confirmation says what changes: delete session, delete tag (with a replacement picker), recategorize (states that past sessions and every number change), delete account (type DELETE) (FE-008).

### 5.3 Loading, empty, error and offline states
- Every screen has loading, empty and error states with retry; offline keeps working (spec 10.2, 10.3, SYNC-03).

### 5.4 Forms and validation
- Inline field errors; overlap conflicts explained inline with the conflicting session (spec 10.3, R-05).

### 5.5 Lists and tables
- History grouped by day with sticky headers and day totals; virtualised; a midnight-crossing session appears in both days, marked as continuing (LOG-01, LOG-07, R-11).

### 5.6 Time, number and credit display
- Clocks `H:MM:SS`, summaries `Xh Ym` rounded down, never negative (R-18).
- Credits: whole credits rounded down, negative in red with a minus sign, with the equivalent time left per class when positive (FE-005, R-44).
- Correct plurals; one date/time format system following the 12/24 h and locale settings (spec 10.4, SET-03).

### 5.7 Charts
- Stats lead with productive hours, then total, productive share, goal progress (FE-006).
- Day: 24 h timeline coloured by category. Week and month: per-day bars stacked by category with the daily goal as a reference line. Month: heatmap of days that met the daily goal (FE-007). Every chart has a data-table alternative (spec 9.4).

_Owner decisions:_ FE-003, FE-005..FE-009.

## 6. Behaviour rules

- Optimistic UI: start/pause feedback under 100 ms (TIM-01, spec 9.3).
- Only the clock text redraws every second (spec 9.3).
- Timer state changes and sync status are announced politely; never every second, including the dialog countdown (spec 9.4).
- An open session dialog closes when the session changes on another device (SYNC-06, R-48).

## 7. Accessibility

WCAG 2.2 AA baseline (X-01, spec 9.4): dialog roles and focus management, everything keyboard-operable, visible focus, selection and categories never by colour alone (the tag name or category label is always present), touch targets at least 44 px on mobile (spec 9.4; 48 dp per Material 3, `.claude/references/ux/android.md`), reduced motion honoured, charts with a data-table alternative.

_Owner decisions:_ none yet (desktop pointer-target size is open).

## 8. Copy and voice

Copy deck: spec Appendix B. Placeholders "What are you working on?" and "What did you accomplish?". Button labels Start/Resume and Pause (R-01). Strings are externalised (SET-06).

_Owner decisions:_ none yet (tone beyond the copy deck is open).

## 9. Desktop vs Android

- Desktop: tray with running/paused state and quick actions, global shortcut that opens the matching dialog, mini always-on-top window (DESK-01, DESK-04, DESK-05); keyboard-first.
- Android: Material 3 navigation, predictive Back, edge-to-edge insets, 48 dp targets (`.claude/references/ux/android.md`); persistent notification with title, tag colour, both timers and Pause/Resume (MOB-02); home-screen widget (MOB-03); permissions onboarding, each step skippable (MOB-06).

_Owner decisions:_ none yet beyond the PRD stories cited.

## 10. Decision log

| ID | Date | Decision | Options considered | Chosen | Applies to |
|---|---|---|---|---|---|
| FE-001 | 2026-10-24 | How a tag is shown | Set by the owner in the PRD (PRD §6 UI rule, US-5.1); no alternatives put | The tag's name on or next to its category colour, everywhere (pickers, chips, history, charts); the category name only in Settings and category-level stats | TagChip, tag picker, history, charts |
| FE-002 | 2026-10-24 | Category colours | Set by the owner in the PRD (PRD §6, US-11.1) | Productive green, Leisure orange, Neutral blue; fixed, not user-editable | Tokens, every category-coloured element |
| FE-003 | 2026-10-24 | Start and pause dialogs | Set by the owner in the PRD (US-5.2, US-5.3); the pre-PRD spec had no dialogs | Both open after the press with a visible 5 s countdown; any interaction cancels it; at 0 they save and close (R-48) | Session dialogs, shortcut, tray, widget, notification actions |
| FE-004 | 2026-10-24 | Main screen content | Set by the owner in the PRD (US-5.1, US-10.1, US-10.2) | Current session timer, day total, title + tag chip (tap to edit while running), one primary Start/Resume or Pause button, today's productive time vs daily goal, credit balance, current and best streak; which timer is larger stays open (D-02) | Today screen |
| FE-005 | 2026-10-24 | Credit balance display | Set by the owner in the PRD (US-7.4, PRD §7) | Whole credits; negative in red with a minus sign; equivalent time left per class ("≈ 1h 20m of gaming / ≈ 40m of social media left") | Today, timer bar, Android notification, widget, stats |
| FE-006 | 2026-10-24 | Stats headline order | Set by the owner in the PRD (US-11.1) | Productive hours (largest), total hours, productive share (%), goal progress | Stats page |
| FE-007 | 2026-10-24 | Stats charts | Set by the owner in the PRD (US-11.1, US-11.3, US-11.4) | Day: 24 h timeline by category; week/month: stacked bars by category with the daily-goal line; month: goal-day heatmap; credits: balance-over-time line | Stats page |
| FE-008 | 2026-10-24 | Confirm or undo for destructive actions | Set by the owner in the PRD (US-5.5, US-6.3, US-6.5, US-4.6); replaces the pre-PRD "prefer undo" rule | Confirm, and say what changes; deleting an account requires typing DELETE | Delete session, delete tag, recategorize, delete account |
| FE-009 | 2026-10-24 | Offline indicator | Set by the owner in the PRD (US-9.2) | A small "Offline – will sync" indicator while the outbox is not empty | Timer bar, Today |

## 11. Open questions

Decisions noticed but not yet put to the owner (for example when working unattended). Each moves to the decision log once answered. Rows marked *assumed* are written into the spec as proposals (spec D-25, marked "proposed" in R-07 and R-48); confirm or change them.

| Question | Where it came up | Options so far |
|---|---|---|
| Which timer is larger on the main screen: the current session or the day total? (D-02) | PRD US-5.1 lists both without an order | Day total larger (pre-PRD recommendation) · session timer larger · equal weight; decide at T2.6 |
| What does Close do in the start dialog? *Assumed:* keeps the values the session had when the dialog opened (the pre-filled ones), discarding edits | R-48; US-5.2 says "waits for Confirm or Close" without defining Close | Keep pre-filled values (assumed) · clear title and tag · save the edits like Confirm |
| If the session changes on another device while a dialog is open, what happens to text typed so far? *Assumed:* saved to that session | R-48, US-9.1 | Save what was typed (assumed) · discard it |
| Pre-fill when the last session's tag is now archived? *Assumed:* pre-fill the title only | R-07, R-52, US-5.2 | Title only (assumed) · keep the archived tag |
