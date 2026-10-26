# Pulse - Rebuild Specification (v3)

> Status: **draft for revision**. Product scope: the owner's **PRD** (`docs/product/PRD.md`, received 2026-10-24), merged into this spec on 2026-10-24. Tech stack: **decided 2026-10-24** (section 11).
> This spec describes *what* to build, the rules it must follow and how the work is split, without referring to any file, function or framework from the legacy code. The legacy code-analysis version is in git history at commit `aad9c2f`; the pre-PRD version of this spec is at commit `689caa1`.

## How to use this document

| Section | Read it for |
|---|---|
| 1. Product summary | What Pulse is and is not |
| 2. Principles | The rules every design decision is checked against |
| 3. Domain rules | The single, canonical definition of every time, goal, credit and tracking concept (R-xx) |
| 4. Mismatches and differences | What was inconsistent in the legacy app and spec, and where this spec implements the PRD differently |
| 5. Feature list | Every feature with an ID, priority, origin and the user stories it delivers |
| 6. Domain model | Entities and invariants (storage-agnostic) |
| 7. Operations & events | The client/server contract at capability level (no routes, no wire format) |
| 8. Sync, realtime & offline | How devices stay consistent and nothing is lost |
| 9. Non-functional requirements | Security, reliability, performance, accessibility, observability |
| 10. UX & design | Information architecture, screens, flows, design-system rules |
| 11. Tech stack | Requirements the stack must satisfy; decision record |
| 12. Task distribution | Workstreams, milestones (the PRD's delivery phases), tasks with dependencies and "done when" |
| 13. Decisions | Decided and still-open questions |
| Appendices | Defaults & limits, copy deck, legacy carry-over actions |

**User stories.** `US-x.y` IDs point to the PRD; `node scripts/spec.mjs US-5.2` prints a story with its acceptance criteria (ACs). Every AC is a testable requirement of the feature that cites the story. Where this spec settles or changes how a story is met, section 4.3 and section 13 say so.

Priorities: **P0** = v1, in the PRD's scope · **P1** = v1, added by this spec (small; needed for quality, offline use or self-hosting) · **P2** = later.
Origin (relative to the legacy app): **Kept** (unchanged), **Changed** (redefined), **New**.

---

## 1. Product summary

**Pulse is a cross-device work-hours tracker built around one timer per user, synced live across that user's devices.**

- One press starts the timer; one press pauses it. Each start-to-pause run is a **session** (start, end, optional title, tag and summary). Small dialogs offer the title and tag at start and a summary at pause; they close by themselves after 5 seconds and never change the times.
- The main screen answers "how long is the current session?" and "how much have I worked today?", with today's **productive** hours against the daily goal and the **credit** balance.
- Every tag belongs to one of three fixed **categories**: Productive (green), Leisure (orange) or Neutral (blue). Goals, streaks and the stats page lead with productive hours.
- **Credits:** productive time earns credits; leisure-tagged sessions and tracked gaming or social media spend them. The balance carries over and may go negative. Pulse notifies; it never blocks anything.
- **Activity tracking** (opt-in, Windows and Android): the apps detect gaming and social media in the background, classify them on the device, and send only per-day totals per class to the server.
- History is editable: fix, delete or add sessions after the fact; every number is recalculated.
- Works offline; everything done offline syncs later without loss or duplication.
- Self-hostable: one Docker Compose command starts the server, with a bundled or an external database.

Users are individuals with their own accounts (the owner first, then friends), so the full sign-up flow exists: email with verification, Google sign-in, password reset, account deletion and export. A user uses one device at a time (PC or phone); every change syncs live between them. Users never see each other's data; there is no admin panel.

Target platforms: **Windows desktop** and **Android** (distributed as a **sideloaded APK**, not through Google Play). Others are P2 (D-09).

Non-goals (v1): iOS, web app, macOS/Linux desktop, Play Store publishing, admin panel, teams or shared workspaces, billing, blocking apps or websites, idle detection, "start your timer" reminders, uploading raw activity logs.

Legacy at a glance (context only): the old app (v0.0.5) had a client-run timer, sessions created by the client on pause, a server that relayed and stored an opaque timer snapshot, no session editing, and many inconsistencies in time definitions. Section 4.1 lists them.

---

## 2. Principles

1. **Never lose tracked time.** No user action, crash, quit, restart, network failure or conflict may silently drop or corrupt time.
2. **The server owns the timer and the clock.** Clients show the server's state locally and correct for clock skew; they never invent the truth.
3. **One definition per concept, implemented once.** Day, week, month, productive time, streak, goal-met, credit and every other concept has exactly one definition (section 3), shared by every screen and every computation.
4. **Offline is normal.** Every write is a command with a client-generated ID, queued durably and replayed safely (idempotent).
5. **Starting and pausing are instant.** The start or end time is the button press. Dialogs around start and pause are optional, never block, and never move the times. The timer is visible in the OS shell (tray, ongoing notification).
6. **Nothing fails silently.** Every failure is visible: sync status, rejected changes, errors, loading and empty states.
7. **Derived data is rebuildable.** Statistics, aggregates, streaks and the credit ledger are computed from sessions, usage totals and settings. Any cache can be thrown away and recomputed.
8. **Small surface, low traffic.** No per-second network or database writes; a handful of requests per session; usage totals at most once a minute.
9. **Simple to self-host.** `docker compose up -d` starts everything; the database is bundled or external; configuration is validated.
10. **Small and fast.** Pulse is a basic app that runs all day: small installers, low memory when minimised, instant start, cheap background work. Size and speed budgets (section 9.3) are release gates.
11. **Minimal activity data.** Only per-day, per-class usage totals (Gaming, Social Media), each tied at most to the timer session it overlapped, leave the device: never app names, URLs, window titles or raw samples.

---

## 3. Domain rules (canonical definitions)

Every rule has an ID so features, tasks and tests can reference it. Where a rule implements a user story, it cites it.

### 3.1 Timer and sessions

| ID | Rule |
|---|---|
| R-01 | A user has **at most one running session** at any time, across all devices. The timer has two states: **Idle** and **Running**. There is no separate "paused" state: *pause* ends the running session, *start / resume* starts a new one (US-5.6). The primary button reads Start/Resume while idle and Pause while running. |
| R-02 | **Start while running** is a no-op that returns the running session. **Pause while idle** is a no-op. **Switch** (P2) = end the current session and start a new one atomically, at the same instant. |
| R-03 | **Timestamps come from the server** for online commands (time of receipt). For commands replayed from the offline queue, the client's occurred-at time (corrected by the last known clock offset) is used. It is clamped to be no later than server time and no earlier than the end of the user's previous session. |
| R-04 | A session must have `end > start` and a duration of at least 1 second. End times in the future are rejected (60 s tolerance for clock skew). |
| R-05 | A user's sessions **must not overlap**, including the running session. Edits and manual entries that would overlap are rejected with a conflict error that identifies the overlapping session (US-5.5). |
| R-06 | **Pause** ends the running session at the instant Pause is pressed, never when the dialog closes. The **summary dialog** then opens (R-48): an optional multi-line summary and Save. Auto-close saves an empty summary. The summary can be added or edited later from history. Pausing never waits for input (US-5.3). |
| R-07 | **Start / resume** starts the session at the instant the button is pressed. The **start dialog** then opens (R-48) with Title (optional), Tag (picker of active tags in their category colours, optional), **+ New tag** (name and category; the new tag is selected at once and the countdown stays cancelled) and Confirm. **Pre-fill:** the title and tag of the user's most recent session from any day and any device; empty for the account's first session. If that tag has since been archived, only the title is pre-filled (D-25). The dialog's values are applied to the running session. Title and tag stay editable while the session runs (US-5.2, US-6.2). |
| R-08 | **Delete** removes a stored session after a confirmation; a tombstone is kept for sync. **Discard** (P2) cancels the running session and records nothing. |
| R-09 | A session records the **timezone in effect when it was created** (manual entries use the user's current timezone). |
| R-48 | **Session dialogs** (start and summary) show a visible **5-second countdown**. Any interaction (typing, focusing a field, opening the tag picker) cancels it; the dialog then waits for Confirm/Save or Close. At 0 it closes and saves the current values. If the session changes on another device while the dialog is open, the dialog closes (US-5.2, US-5.3, US-9.1). Close keeps the values the session had when the dialog opened (for the summary dialog: an empty summary); text entered before a change on another device is saved to that session (D-25). |
| R-53 | **No idle detection, no auto-stop, no start reminders** (explicit owner decision). A running session keeps running on the server when the apps are closed or the devices are off. Pulse never asks the user to start the timer. |

### 3.2 Days and periods

| ID | Rule |
|---|---|
| R-10 | A **day** is a calendar date in a timezone, identified as `YYYY-MM-DD`. All day math uses one well-tested timezone library with the IANA database (one per implementation, kept identical by the shared fixtures, D-19). Never use device-locale date strings. |
| R-11 | **Day attribution:** a session's seconds count toward the local days it covers, *clipped at local midnight* in the session's own timezone (R-09). A session that crosses midnight stays **one record** (D-03). History shows it as **one row per local day** with the same title, tag and summary: the first row ends at 23:59:59, the next starts at 00:00:00; editing either row edits the session. The current session timer keeps counting across midnight; only the day total resets. Devices that were offline at midnight need no special handling (US-5.4). |
| R-12 | **"Today", "this week", etc.** are evaluated in the user's **current timezone setting**, not the device's timezone. A period is a set of day keys; its total is the sum of the seconds attributed to those keys. |
| R-13 | **Week** = 7 consecutive days starting on the user's *week start* setting (default Monday). **Month** = calendar month in the user's timezone. **Year** = calendar year. Rolling windows exist only when labelled explicitly ("Last 7 days") (US-10.1). |
| R-14 | **Period IDs:** day `2026-10-24`, week = date of its first day `W2026-10-19`, month `2026-10`, year `2026`. |
| R-15 | The **timezone setting changes only by explicit user action**. At first sign-in the user confirms it, pre-filled from the device (US-4.1). Later, when the device timezone differs, the client offers to switch; it never changes the setting silently. |

### 3.3 Durations, totals and categories

| ID | Rule |
|---|---|
| R-16 | Store instants, not accumulated numbers. Compute durations in **integer seconds**. Never accumulate floating-point minutes. |
| R-17 | **Worked time** (total time) of a day or period = attributed seconds of closed sessions + attributed seconds of the running session up to *now*. It is always live. The **current session timer** = now − start of the running session (0 when idle; it resets on every start). The **day total** = today's worked time; it never resets on pause, only at local midnight (US-5.1). |
| R-18 | **Display:** clocks show `H:MM:SS` (hours unbounded). Summaries show `Xh Ym`, **rounded down** to the whole minute, so a goal is never shown as reached before it is. Displayed elapsed time is never negative (clamp at 0). Credits display per R-44. |
| R-50 | **Categories:** three fixed categories, **Productive**, **Leisure** and **Neutral**. Every tag belongs to exactly one; an untagged session counts as Neutral. A session's category is always its tag's *current* category: recategorizing a tag changes it for all past sessions with that tag, and everything derived is recalculated (R-54) (US-6.3). |
| R-51 | **Productive time** of a day or period = worked time (R-17) of Productive sessions only. **Goals, streaks and goal notifications measure productive time only**; stats also show leisure, neutral and total time (US-10.1). |

### 3.4 Goals, streaks and achievements

| ID | Rule |
|---|---|
| R-19 | Three goal kinds: **daily, weekly, monthly** productive-time goals. Each is either a duration in minutes or **unset**, independently; all are unset by default. Unsetting keeps the last value, so setting it again restores it (on every device) (US-10.1). |
| R-20 | Goals are **effective-dated**. A change applies to the current period and later ones; past periods keep the goal that was in effect when they ended. |
| R-21 | **Count weekends** (default on). When off, Saturdays and Sundays are skipped by streaks: they neither break nor extend them. Weekend work still counts toward every total and goal (US-10.2). Replaces the legacy "working days" idea (D-05). |
| R-22 | A day **qualifies** when a daily goal was in effect that day and its productive time ≥ that goal. |
| R-23 | **Current streak** = number of consecutive qualifying days counting back from today, skipping weekend days when Count weekends is off. *Today counts only if it already qualifies; an unfinished today never breaks the streak.* **Best streak** = the longest such run. Streaks are hidden while no daily goal is set. Editing history recalculates them (US-10.2, R-54). |
| R-24 | **Goal achievement %** (P2, INS-10) for a range = qualifying days ÷ eligible days. Eligible days are the counted days (R-21) in the range with a daily goal in effect, up to yesterday, plus today if it already qualifies. One decimal place. |
| R-25 | **Average per active day** (P2, INS-10) = total ÷ number of days in the range with at least 1 minute of work. The label must say "per active day". |
| R-26 | **Best day** (P2, INS-10) = the day with the highest total in the range; ties go to the most recent day. Always shown with its date. |
| R-27 | An **achievement** ("goal reached") happens at the first moment a period's productive time reaches its set goal. It is recorded **once per (goal kind, period ID)** by the server, notified on every device once (including devices that were offline, when they reconnect), and never revoked by later edits. It fires **live** while the timer runs, not only at pause. Changes to past periods do not notify (D-12) (US-10.3). |
| R-28 | Progress bars cap at 100%; percentage text may exceed 100%. "Remaining" = max(0, goal − productive time). |

### 3.5 Tags and filters

| ID | Rule |
|---|---|
| R-29 | Tag names are trimmed, internal whitespace collapses to single spaces, and length is **1-40 characters**. Names are **unique per user** by a normalised key (Unicode NFKC + case-fold). The display name keeps the user's casing. Creating a tag whose key already exists is rejected (`CONFLICT`, naming the existing tag and its category), and the picker offers to use the existing tag instead; a replayed create command returns its original result (R-34). Every tag has a category (R-50) (US-6.2). |
| R-30 | Renaming keeps the tag's identity, so history shows the new name. **Delete:** a tag with no sessions is deleted after confirmation; a tag with sessions (including the running one) requires a **replacement** (any active or archived tag, or Untagged): all its sessions are reassigned, then the tag is deleted and everything derived is recalculated (US-6.5, R-54). |
| R-31 | **Tag filter** (P2 page-wide filter): with a tag selected, every total, series and summary is limited to that tag, and goal-based metrics are hidden, because goals are not per tag. The by-tag breakdown shows each tag's share of the *unfiltered* total. |
| R-52 | **Archive:** an archived tag disappears from pickers (and from start-dialog pre-fill) but keeps showing in history, stats and the session list; it can be unarchived (US-6.4). |

### 3.6 Time-integrity guards (removed)

| ID | Rule |
|---|---|
| R-32 | *Removed 2026-10-24 (owner's PRD: no idle detection, R-53).* Was: away detection with a keep/discard prompt on desktop. |
| R-33 | *Removed 2026-10-24 (owner's PRD: running sessions keep running, R-53).* Was: forgotten-timer reminder and server auto-stop. |

### 3.7 Consistency

| ID | Rule |
|---|---|
| R-34 | Every write carries a **client-generated ID** (idempotency key). The server keeps the result for at least 30 days, and a replay returns the original result. Online-only credential operations are not commands and carry none (D-30). |
| R-35 | Each user has a **revision counter** that increases on every change. Events and change-feed entries carry the revision. Clients apply only newer revisions; a gap triggers a change-feed fetch. |
| R-36 | The server **never silently drops** a client change. A rejected queued change becomes a **sync issue** that the user can fix or discard. |
| R-49 | **Latest action wins** for concurrent changes to the same field of the same object (for example a title edited on two devices): the change with the later occurred-at time, corrected by its device's clock offset (R-03), wins, and an older change that arrives later does not overwrite a newer value. Timer commands follow R-02 and section 8.5 (the first start wins). A change that would break an invariant (an overlap, R-05) is never merged silently; it becomes a sync issue (R-36) (US-9.2). |
| R-54 | **Recalculation:** every session create, edit or delete, tag recategorization, class-link change or deletion, goal change, credit-rate change and late-arriving usage increment recalculates the affected days' totals, goal results, streaks and credits in the same transaction as the change (US-5.5, US-6.3, US-10.2). |

### 3.8 Activity tracking

| ID | Rule |
|---|---|
| R-37 | Activity tracking is **opt-in per device** and can be paused or disabled at any time. While it is active, the device shows it (tray icon state on desktop, the persistent notification on Android) (US-8.6). |
| R-38 | **Sampling stays on the device.** The device checks the foreground app at least every 5 s: the executable name on Windows (`eldenring.exe`), the package name on Android (`com.instagram.android`), and for browsers the site's **registrable domain** (`youtube.com`): on Windows from the window title and the browser's address bar (Chrome, Edge, Firefox, Brave; D-22), on Android through the optional accessibility service that reads only the address bar of known browsers. Raw samples, window titles and URLs never leave the device; samples are kept locally for at most 7 days (for "Recently seen apps") and then deleted (US-8.1, US-8.2, US-8.5). |
| R-39 | **Presence:** usage counts only while the user is present: a locked screen, sleep or a screen that is off stops counting. Usage on different devices may overlap and both count (one user rarely uses two devices at once) (US-8.1). |
| R-40 | **Classification happens on the device.** Distraction classes: **Gaming** and **Social Media**. A subject's class is resolved in this order: the user's enabled usage rule on that device (Gaming / Social Media / Ignore; a domain rule covers its subdomains), then the shipped default rules, then platform signals: on Android an app whose system category is Game is Gaming; on Windows the smart game signals (ACT-03) raise a suggestion, and until it is answered the time counts as Gaming only if a game-library-folder signal matched. Anything else is not tracked. The answer to a suggestion becomes a usage rule: Yes → Gaming, No and Neutral → Ignore (D-24) (US-8.2, US-8.3, US-8.4). |
| R-41 | **Only usage totals leave the device.** While tracked usage happens, at most every 60 s (and when it ends), the device sends an **increment**: device, local day (user's timezone, R-12), class, seconds, and the ID of the session it overlapped, or none. An increment never spans local midnight or a session's start or end. Increments are commands (R-34): queued offline and replayed idempotently. The server keeps per-device, per-day, per-class totals, split by overlapped session where credits need it (R-43). Rule changes affect new usage only. If an overlapped session is later deleted, its overlap counts as usage outside a session; if it is edited shorter, its overlap is capped at its new duration (US-8.5). |

### 3.9 Credits

| ID | Rule |
|---|---|
| R-42 | **Earning:** each second of a Productive session earns the **earn rate** (credits per hour ÷ 3600), except seconds overlapped by tracked Gaming or Social Media usage, which earn nothing (D-21). Neutral and untagged time earn nothing (US-7.1). |
| R-43 | **Spending:** tracked usage costs its class rate (Gaming, Social Media) per second, whether or not a session runs. Leisure-session seconds not overlapped by tracked usage cost the tag's linked class rate, or the **other-leisure rate** when the tag has no class (a tag's class link, like its category, applies to all its sessions, R-50); overlapped seconds are charged once, at the usage's class rate (**no double charging**). Neutral time costs nothing. The balance may go negative; it is never blocked or clamped (US-7.2, US-7.3, US-7.4). Default rates: D-15. |
| R-44 | **Ledger and balance:** credits are computed per second from the rates in effect at that second; each ledger entry is stored rounded to 2 decimals. The **ledger** is append-only. It gets a **session** entry per session and local day, and a **tracked usage** entry per usage total (device, day, class), each with date, source, category or class, minutes and credits. When a later change alters the credits of earlier time (an edit, deletion, recategorization, class-link change or tag reassignment, or a usage increment arriving late and overlapping an earlier session), a **recalculation** entry is appended, dated at that change, with the delta and what caused it, so the user sees why the balance moved. **Balance** = sum of all entries; it never resets and has no cap (carry-over, D-17). Per-day views (daily aggregates, the balance line, the CSV daily summary) attribute credits to the day the time happened, using current data. **Rates are effective from the instant they are saved**; recalculating a past entry uses the rates that were in effect when its time happened. The ledger is derived data (principle 7): a rebuild from sessions, usage totals, tags and the rate history gives the same balance, folding past recalculations into their source entries. **Display:** whole credits, rounded down; negative balances in red with a minus sign; when positive, the equivalent time left per class (balance ÷ class rate, `Xh Ym` rounded down: "≈ 1h 20m of gaming / ≈ 40m of social media left") (US-7.4, US-7.5, US-7.6). |
| R-45 | The **live balance** on a device = the last balance from the server + the deltas of this device's unsynced time (running session, unsent usage), computed with the same math. It ticks while a Productive or Leisure session runs or tracked usage happens (US-7.1). |
| R-46 | **Credit notifications** are raised by the device where the spending happens, from its live balance, so they work offline. Each fires once per crossing and has its own toggle: **low** when the balance drops to 10 minutes or less of the class currently being spent (at that class's rate); **zero** when it reaches 0; **below zero**, a reminder after every further 15 minutes of tracked usage while the balance stays at or below 0. Thresholds are in Appendix A and configurable (US-10.3). |
| R-47 | *Removed 2026-10-24 (owner's PRD).* Was: a "timer still running while on {subject}" notification; R-42 (overlapped time earns nothing) replaces it. |

---

## 4. Mismatches and differences

### 4.1 In the legacy product (behaviour)

| # | Mismatch | Effect | Resolution |
|---|---|---|---|
| L1 | "Week" meant the calendar week (Mon-Sun) on some screens and the rolling last 7 days on others; "month" meant the rolling 30 days on some and the calendar month on others | Different "this week" totals on different screens | R-13 |
| L2 | The weekly trend used rolling 7-day blocks labelled "Week 1..4", while the week chart used calendar weeks | Trend and week chart disagree | R-13, INS-03 |
| L3 | The device timezone drove the client's "today" while the user-setting timezone drove server stats; the client silently overwrote the setting with the device zone | Clock and stats disagree after travel; two devices in different zones fight | R-12, R-15 |
| L4 | The server attributed a whole session to its start day; only the client split sessions at midnight, so multiple devices could each post the split (duplicates); a multi-day gap credited only one day | Skewed and duplicated daily totals | R-11 |
| L5 | Session end time = when the summary dialog closed, not when pause was pressed | Saved sessions longer than the clock showed; clock then "jumped" to match | R-06 |
| L6 | The big clock showed today's total and the "Today" card showed the server value; the card did not tick while running | Two different "today" numbers on one screen | R-17 |
| L7 | "Reset" zeroed the live clock, but the next stats refresh re-seeded it from saved sessions; reset had no UI | Meaningless operation | Removed; deleting a session (R-08) replaces it |
| L8 | The title carried over to the next session silently, but the tag was replaced | Inconsistent, surprising reuse | R-07 (title and tag pre-filled together, visibly) |
| L9 | The start button said "Resume" on the first start of the day; the dialog button said "Pause" after the timer had already paused | Misleading labels | R-01 labels follow the state; dialogs never move the times (R-06, R-07) |
| L10 | Streak = days with *any* work (the original plan said "days hitting the target"), and it dropped to 0 every morning until you worked | Streak meaningless and flickering | R-22, R-23 |
| L11 | Goal achievement % counted only days that had work; days with no work were not counted as missed | Inflated percentage | R-24 |
| L12 | Default goals 8 h/day applied to all 7 days, while weekly 40 h and monthly 160 h assume 5-day weeks | Daily goal "missed" every weekend; streak broken by weekends | Goals unset by default (R-19); Count weekends setting (R-21, D-05) |
| L13 | The daily achievement used the *current* goal while the stats used a per-day snapshot | "Goal met" differed between toast and stats after a goal change | R-20 |
| L14 | The weekly achievement's period ID was a day, not a week; deduplication was in memory only | Weekly celebration could repeat; restarts re-celebrated | R-14, R-27 |
| L15 | Achievements fired only when a session was saved (after pause and dialog), never live | Celebration delayed until stop | R-27 |
| L16 | With a tag filter, tag minutes were compared against the full daily goal | Meaningless percentages | R-31 |
| L17 | "Average/Day" divided by days with data (all time), unlabelled | Misleading metric | R-25 |
| L18 | Best day ties were unordered; one screen showed the best day without its date | Unstable / incomplete | R-26 |
| L19 | Goal "off" was stored as 0; the remembered value lived only in one device's local storage and was rounded to whole hours (a 90-minute goal displayed as 2 h, under 30 min fell back to defaults) | Lost precision; re-enabling differed per device | R-19 |
| L20 | Time while the app was closed or the machine slept counted as work; on an offline restart the time stayed on the clock but was never saved | Inflated or lost time | Server-owned timer; a running session keeps running by owner decision (R-53), and the user corrects history (LOG-03) |
| L21 | Stats were stored as running sums that could not be recomputed, while sessions could not be edited | No way to fix a mistake | Principle 7, R-54, LOG-03..05 |
| L22 | Marketed as "offline-first", but opening the app offline with an expired access token showed the login screen | Unusable offline | AUTH-03, SYNC-03 |
| L23 | A 12-month chart was advertised but not built | Promise not kept | INS-04 (P2, not promised for v1) |
| L24 | Day rollover ran only while the dashboard screen was open | Midnight missed on other screens | R-11 (no rollover needed) |

### 4.2 In the legacy spec document (contradictions between its own sections)

| # | Contradiction | Resolution in this version |
|---|---|---|
| S1 | Three different timer models were recommended: segment-only, versus `{started_at, accumulated_ms, version}` (twice). An "accumulated" field brings back the per-day stopwatch | Segment-only: a running session is a session without an end (R-01, section 6) |
| S2 | Three different command sets: start/pause/reset, start/pause/discard, start/pause/stop/edit; "pause" and "stop" were never distinguished | One set: start, pause (= stop), update running, plus switch and discard as P2 (R-01, R-02, section 7) |
| S3 | "Preserve exactly: client splits at midnight" versus "split server-side" | Neither: one record clipped at read time and shown as one row per day (R-11, D-03) |
| S4 | "Preserve: auto-update timezone from device on launch" versus "explicit toggle, no silent update" | Explicit only (R-15) |
| S5 | "Preserve exactly: title/summary dialogs with 5 s auto-skip" versus "no modal, no countdown, notes after the fact" | The owner's PRD keeps the dialogs with a 5 s countdown; the start and end are the button presses, so the dialogs never change the times (R-06, R-07, R-48) |
| S6 | "Must preserve: 0 = goal disabled" versus "disabled as explicit null" | Explicit unset state with remembered value (R-19) |
| S7 | "Must preserve: Monday-first weeks (hard-coded)" versus a week-start setting | Setting, default Monday (R-13) |
| S8 | "Must preserve client contract quirks (24-hex ids, newest-first weekly endpoint)" although every client is being rebuilt | No legacy wire compatibility; contract designed fresh (section 7) |
| S9 | The executive summary recommended one desktop platform while the delivery section planned another platform's updater and installer | Stack decided once in section 11 |
| S10 | "Magic constants to carry over" included values the redesign removes (10 Hz tick, 10 s midnight poll, 30 s queue poll, hard-coded device name, 1 h / 10 h goal steps) | Appendix A lists only constants that remain meaningful |
| S11 | Goals "whole hours with steppers" (preserve list) versus "hours *and* minutes precision" (redesign) | Minute precision (R-19, GOAL-01) |
| S12 | "Preserve: token refresh ~2 min before expiry; session expiry returns to login" versus "never block the UI on access-token validity" | Signed in = has a valid refresh credential; offline use never needs a fresh access token (AUTH-03) |
| S13 | "Resets propagate" listed as preserved behaviour, but reset had no UI and was ambiguous (L7) | Removed |
| S14 | Line references in different parts pointed to different line ranges for the same code (for example two ranges for the same rollover routine) | All code references removed; behaviour is described by rule IDs |
| S15 | Rolling "last 30 days" was labelled "month" in the endpoint list and "30-day" in the feature list | R-13 naming |

### 4.3 Where this spec implements the PRD differently

The PRD describes behaviour; it says it does not prescribe implementation. Where its wording suggests a mechanism that conflicts with a principle above, this spec meets every AC another way:

| PRD | What the spec does instead | Why |
|---|---|---|
| US-5.4: the backend splits a midnight-crossing session into two sessions with a scheduled job per timezone | One record, shown as one row per day; the day total resets and the session timer keeps counting (R-11). Owner's choice, D-03 | No scheduled job, no offline or timezone-change edge cases; every visible AC holds |
| US-9.1: a "midnight split" event | Not needed: clients re-attribute days locally at midnight (R-11, R-12) | Follows from D-03 |
| US-9.2: the server resolves conflicts by latest action wins | Latest action wins per field (R-49); the first start still wins for the timer (PRD §5 edge cases); overlaps become sync issues (R-36) | LWW cannot merge two overlapping sessions without losing time (principle 1) |
| §3: JWT_SECRET / REFRESH_SECRET for token signing | `JWT_SECRET` signs short-lived access tokens; refresh tokens are random, stored as HMAC hashes keyed by `REFRESH_SECRET`, rotated with reuse detection (9.1) | Revocable per device (US-4.3) |
| §3: /packages/shared holds credit math, midnight split and category colours | The TypeScript server and the Rust client core implement the math separately and must pass one shared fixture suite (D-19); category colours live in the design tokens; default usage rules ship as one data file used by the core | One client core serves both apps (section 11) |
| US-8.5: increments flagged "overlapping a leisure session or not"; the server stores per-day, per-class totals per device | Increments carry the ID of the overlapped session (any category), and totals are split by it (R-41) | D-21 (usage during a Productive session stops its earning) and recalculation after edits (R-54) need to know which session was overlapped; still no app, URL or title leaves the device |
| PRD §11 "Performance": per-day aggregate rows | Per-day aggregates are kept, updated in the same transaction and fully rebuildable (section 6, principle 7) | Same intent, stated as an invariant |

---

## 5. Feature list (revise here)

Columns: **ID** · **Feature** · **Pri** · **Origin** · Notes / acceptance. Rule IDs point to section 3; `US-x.y` to the PRD, whose ACs are part of the acceptance.

### 5.1 Accounts & authentication (AUTH)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| AUTH-01 | Sign up with email and password; timezone confirmed at first sign-in (R-15) | P0 | Changed | US-4.1; password 8-128 characters; email unique, case-insensitive; uniform, non-revealing errors |
| AUTH-02 | Sign in / sign out; sign-out revokes this device's credentials on the server | P0 | Changed | US-4.3 |
| AUTH-03 | Stay signed in across restarts and while offline; credentials in OS secure storage; the UI never blocks on access-token freshness | P0 | Changed | US-4.3; offline cold start opens the app with cached data |
| AUTH-04 | Session-expired flow: clear message, sign in again, queued offline work is kept and replayed | P1 | New | |
| AUTH-05 | Signed-in devices list (name, platform, last seen) with Sign out per device | P0 | New | US-4.3; revocation disconnects that device's live channel |
| AUTH-06 | Change password (revokes other devices) and email (new email must be verified before it replaces the old one) | P0 | New | US-4.5; D-31 |
| AUTH-07 | Password reset by email: link valid 1 h, single use; using it signs out all other devices; the response never reveals whether the email exists | P0 | New | US-4.4 |
| AUTH-08 | Delete account: type DELETE plus password (or Google re-auth); hard-delete every session, tag, credit, usage total, device and setting; confirmation email | P0 | New | US-4.6; export offered first; D-31 |
| AUTH-09 | Registration lock for self-hosted servers (invite-only or closed) | P2 | New | D-11 |
| AUTH-10 | Email verification: link valid 24 h; unverified users cannot sign in and can resend (at most once a minute) | P0 | New | US-4.1; D-31 |
| AUTH-11 | Sign in with Google on Windows (system browser + loopback redirect) and Android; an existing account with the same email is linked, not duplicated; Google accounts count as verified | P0 | New | US-4.2 |
| AUTH-12 | First sign-in setup: confirm the timezone, receive the starter tags (TAG-07) | P0 | New | US-4.1, US-6.1 |
| AUTH-13 | Export all my data as JSON | P0 | New | US-4.7 |

### 5.2 Timer (TIM)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| TIM-01 | One timer per user; one primary Start/Resume or Pause button; the start or end time is the press | P0 | Changed | US-5.1, US-5.2, US-5.3; R-01, R-02; UI responds in under 100 ms (optimistic) |
| TIM-02 | Start dialog: title, tag, + New tag, Confirm, 5 s countdown, pre-filled from the most recent session; title and tag editable while running (tap them on the main screen) | P0 | Changed | US-5.2; R-07, R-48 |
| TIM-03 | Summary dialog on pause: optional summary, Save, 5 s countdown; summary editable later | P0 | Changed | US-5.3; R-06, R-48 |
| TIM-04 | Main screen: current session timer, day total timer, title and tag chip, primary button, today's productive time vs daily goal, credit balance; both timers tick at 1 Hz on the second boundary from the server's start timestamp | P0 | Changed | US-5.1; R-17, R-18, D-02 |
| TIM-05 | Switch task: end the current session and start a new one in one action | P2 | New | R-02 |
| TIM-06 | Discard the running session | P2 | New | R-08 |
| TIM-07 | Adjust the running session's start ("I started 10 minutes ago") | P2 | New | Must respect R-05 |
| TIM-08 | *Removed 2026-10-24:* Continue chip; replaced by the start dialog's pre-fill (TIM-02, R-07) | - | - | |
| TIM-09 | The timer is visible on every screen (persistent timer bar) | P1 | New | |
| TIM-10 | Accurate across sleep, lock and app close; time is computed from instants, never by counting ticks; a running session keeps running while apps are closed | P0 | Kept | R-53; server owns the running session |
| TIM-11 | *Removed 2026-10-24:* away detection (R-32) | - | - | |
| TIM-12 | *Removed 2026-10-24:* forgotten-timer reminder and auto-stop (R-33) | - | - | |
| TIM-13 | Pomodoro / break reminders (off by default) | P2 | New | |

### 5.3 Sessions & history (LOG)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| LOG-01 | History grouped by day: start-end, duration, title, tag chip, summary; day totals and sticky day headers | P0 | Changed | US-5.5 |
| LOG-02 | Jump to a date / custom range in history | P1 | Changed | |
| LOG-03 | Edit a finished session: title, tag, summary, start, end | P0 | New | US-5.5; R-04, R-05 with clear conflict messages; R-54 |
| LOG-04 | Delete a session after confirmation | P0 | New | US-5.5; R-08, R-54 |
| LOG-05 | Add a past session manually (date, start, end, title, tag, summary) | P0 | New | US-5.5; R-04, R-05, R-09, R-54 |
| LOG-06 | Session list of a period, filterable by tag and category, searchable by title and summary text; each row opens the edit view | P0 | New | US-11.5 |
| LOG-07 | A session crossing midnight appears as one row per day (same title, tag and summary), marked as continuing | P0 | Changed | US-5.4; R-11 |
| LOG-08 | CSV export of the selected period: a sessions file and a daily summary file with the PRD's columns | P0 | New | US-11.6 |
| LOG-09 | Multi-select to edit or delete several sessions | P2 | New | |
| LOG-10 | Split or merge sessions | P2 | New | |
| LOG-11 | *Removed 2026-10-24:* review flags for auto-stopped and away sessions (R-32, R-33 removed) | - | - | |

### 5.4 Tags & categories (TAG)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| TAG-01 | Create (name + category), rename; case- and Unicode-insensitive uniqueness; from Settings and from the start dialog | P0 | Changed | US-6.2; R-29 |
| TAG-02 | Tag picker: active tags in their category colours, searchable, recently used first, + New tag inline | P0 | New | US-5.2, US-6.2; R-07 |
| TAG-03 | Delete with reassignment to a replacement tag or Untagged; confirmation | P0 | Changed | US-6.5; R-30 |
| TAG-04 | Tags shown in their category's colour everywhere (pickers, chips, history, charts); the category name appears only in Settings and category-level stats | P0 | Changed | PRD §6 UI rule; R-50 |
| TAG-05 | Archive and unarchive | P0 | New | US-6.4; R-52 |
| TAG-06 | Recategorize a tag; the confirmation states that past sessions and every number change | P0 | New | US-6.3; R-50, R-54 |
| TAG-07 | Starter tags at first sign-in: Deep Work, Learning (Productive); Meeting, Admin, Break (Neutral); Gaming, Social Media (Leisure, linked to their classes) | P0 | New | US-6.1 |
| TAG-08 | Link a Leisure tag to a distraction class (Gaming or Social Media) | P0 | New | US-7.2; R-43 |

### 5.5 Goals & streaks (GOAL)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| GOAL-01 | Daily, weekly and monthly productive-hours goals, each optional, with typed hours + minutes input; the last value is remembered when unset | P0 | Changed | US-10.1; R-19, R-51 |
| GOAL-02 | Effective-dated goals: changing a goal never rewrites the past | P0 | Changed | R-20 |
| GOAL-03 | Count weekends setting for streaks (default on) | P0 | Changed | US-10.2; R-21 |
| GOAL-04 | Progress bars: daily on the main screen, all three on the stats page (productive time vs goal, remaining) | P0 | Changed | US-10.1; R-28 |
| GOAL-05 | Goal reached (daily, weekly, monthly): live, once per goal per period, on every device once | P0 | Changed | US-10.3; R-27 |
| GOAL-06 | Per-weekday daily targets | P2 | New | |
| GOAL-07 | Current and best streak on the main screen and the stats page; hidden without a daily goal | P0 | New | US-10.2; R-22, R-23 |

### 5.6 Stats (INS)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| INS-01 | Stats page: Day / Week / Month with previous/next | P0 | Changed | US-11.1; R-13 |
| INS-02 | Week and month: bar per day stacked by category (Productive green, Leisure orange, Neutral blue) with the daily goal as a reference line | P0 | Changed | US-11.1 |
| INS-03 | Weekly trend: last N calendar weeks | P2 | Changed | L2 |
| INS-04 | Year view: monthly bars | P2 | New | |
| INS-05 | Breakdowns for the period: time per category and per tag, plus tracked Gaming and Social Media minutes | P0 | Changed | US-11.2 |
| INS-06 | Headline numbers in this order: productive hours (largest), total hours, productive share (%), goal progress; current and best streak | P0 | Changed | US-11.1, US-11.3; R-51, R-23 |
| INS-07 | Comparison with the previous period | P2 | New | |
| INS-08 | Month view: calendar heatmap of days that met the daily goal | P0 | New | US-11.3; R-22 |
| INS-09 | Day view: timeline of the day's sessions across 24 h, coloured by category | P0 | New | US-11.1 |
| INS-10 | Extra summary tiles: average per active day, best day, goal achievement %; page-wide tag filter | P2 | New | R-24..R-26, R-31 |

### 5.7 Sync & offline (SYNC)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| SYNC-01 | Live cross-device updates over an authenticated WebSocket (one room per user) with automatic reconnect and backoff: timer, sessions, tags, settings, credits, goal reached | P0 | Kept | US-5.6, US-9.1; p95 under 1.5 s |
| SYNC-02 | Every write works offline: applied at once, queued durably with a unique ID and the device timestamp, replayed in order, idempotently | P0 | Changed | US-9.2; R-34, R-49 |
| SYNC-03 | Offline cold start shows cached data for the signed-in user | P0 | New | |
| SYNC-04 | "Offline – will sync" indicator while changes are queued; a sync-issues list for rejected changes | P0 | New | US-9.2; R-36 |
| SYNC-05 | Clock-skew correction against server time; displayed times never depend on the device clock | P0 | New | US-9.3; section 8.2 |
| SYNC-06 | An open start or summary dialog on another device closes when the session changes elsewhere | P0 | New | US-9.1; R-48 |
| SYNC-07 | On (re)connect: fetch a state snapshot (running session, today's totals, balance) and the changes since the stored revision before applying live events | P0 | New | US-9.1; section 8.4 |

### 5.8 Notifications (NOTIF)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| NOTIF-01 | Goal-reached notifications (daily, weekly, monthly): native notification, in-app toast when open; clicking focuses the app; deduplicated by the server | P0 | Kept | US-10.3; R-27; copy in Appendix B |
| NOTIF-02 | *Removed 2026-10-24:* forgotten-timer reminder (R-33) | - | - | |
| NOTIF-03 | One toggle per notification type (credit low, zero, below zero, daily goal, weekly and monthly goal, game suggestion), synced | P0 | New | US-10.3; D-32 |
| NOTIF-04 | Android push through FCM for notifications that must reach a phone whose app is not running (goal reached); Pulse works fully without it when FCM is not configured or Google Play services are missing | P0 | New | US-10.3; D-23 |

### 5.9 Desktop shell (DESK)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| DESK-01 | Tray icon showing running or paused; menu with Start/Resume, Pause, current timers, Open, Quit | P0 | Changed | US-12.2 |
| DESK-02 | Closing the window minimises to the tray: the window is destroyed and the native process stays alive (`prevent_exit`), never `window.hide()` (T0.7: hidden costs about 76 MB, destroyed 3.9 MB; budget in 9.3) | P0 | Kept | US-12.2 |
| DESK-03 | Launch at startup (toggle, default on), starting hidden in the tray | P0 | Changed | US-12.3 |
| DESK-04 | Global shortcut, configurable, default Ctrl+Alt+Space: toggles start/pause and opens the matching dialog | P0 | New | US-12.4 |
| DESK-05 | Optional always-on-top mini window with both timers and a start/pause button | P0 | New | US-12.5 |
| DESK-06 | Installer signed when a certificate is available; signed auto-update from the server or GitHub releases | P0 | New | PRD §12 |
| DESK-07 | Single instance; remembers window size and position; minimum window size; no developer menus or tools in production builds | P1 | Changed | |
| DESK-08 | Credentials stored in Windows Credential Manager | P0 | New | US-4.3 |
| DESK-09 | macOS / Linux builds | P2 | New | D-09 |

### 5.10 Mobile (MOB)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| MOB-01 | Native Android app with the same screens and behaviour as the desktop, sharing the client core | P0 | Changed | Legacy mobile behaviour was never analysed - see T1.12 |
| MOB-02 | Persistent notification while a session runs: title, tag colour, session timer, day total, Pause/Resume; its foreground service also hosts tracking and the realtime connection; battery-optimisation guidance | P0 | Kept | US-12.6, US-8.2 |
| MOB-03 | Home-screen widget: day total, session timer, credit balance, start/pause; updates on state change (quick-settings tile: P2) | P0 | New | US-12.7 |
| MOB-04 | iOS | P2 | New | D-10 |
| MOB-05 | Sideloaded distribution: signed APK; the app checks the server's version endpoint, downloads the new APK over HTTPS, verifies it and installs it | P0 | New | PRD §12; the signing key must be backed up; losing it forces users to reinstall |
| MOB-06 | Permissions onboarding: explains and requests notifications, Usage Access, optional Accessibility (with "Allow restricted settings" guidance for sideloaded apps on Android 13+) and the battery-optimisation exemption, each skippable; status shown in Settings | P0 | New | US-12.8, US-12.1 |

### 5.11 Settings & preferences (SET)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| SET-01 | Theme light / dark / system (synced), applied before first paint (no flash) | P0 | Changed | US-12.1 |
| SET-02 | Timezone shown and editable; offer to switch when the device timezone differs | P0 | Changed | US-12.1; R-15 |
| SET-03 | Week start (P0, US-10.1); 12/24-hour time (P1) | P0/P1 | New | R-13; D-32 |
| SET-04 | Server URL configurable in the app ("Advanced" on the sign-in screen) | P1 | New | Self-hosting without rebuilding |
| SET-05 | About: version from build info, update status, export client logs | P1 | Changed | |
| SET-06 | Translatable strings (no inline copy); additional languages | P2 | New | Externalising strings is cheap early |

Settings sections follow US-12.1. **Account settings** (synced): timezone, week start, count weekends, goals, theme, notification toggles, credit rates, tags. **Device settings** (local): tracking on/off and pause, usage rules, recently seen apps, Android permission status, launch at startup, global shortcut, mini window, server URL.

### 5.12 Self-hosting & operations (OPS)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| OPS-01 | `docker compose up -d` on a fresh VPS or EC2 instance starts a working system: server image (non-root) plus a bundled database under a Compose profile, used when `DATABASE_URL` is empty (data on a named volume); with `DATABASE_URL` set, the external database is used; migrations run on server start; `/health` reports API and database status | P0 | Changed | PRD §3 |
| OPS-02 | README: first deploy, updating to a new version, backup and restore of the bundled database (restore tested), building the desktop installer and the Android APK | P0 | Changed | PRD §3 |
| OPS-03 | Validated configuration from the variables in Appendix A; refuses weak or placeholder secrets; configurable CORS allow-list and proxy trust | P0 | Changed | PRD §3 |
| OPS-04 | Structured logs with request IDs (P0); metrics (P2) | P0 | Changed | PRD §13 |
| OPS-05 | Migrate legacy data (users, sessions, tags, goals) from the old deployment | P1 | New | D-08 (decided: yes) |
| OPS-06 | Optional reverse proxy with automatic HTTPS for `DOMAIN` (the apps need HTTPS and WSS in production) | P0 | New | PRD §3 |
| OPS-07 | Outgoing email over SMTP (Gmail app password by default): verification, password reset, email change, account deleted | P0 | New | US-4.1, US-4.4, US-4.6 |

### 5.13 Cross-cutting (X)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| X-01 | Accessibility baseline WCAG 2.2 AA | P0 | Changed | Section 9.4 |
| X-02 | In-app keyboard shortcuts and command palette | P2 | New | |
| X-03 | Performance and size budgets met | P0 | New | Section 9.3 |

### 5.14 Activity tracking (ACT)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| ACT-01 | Windows foreground-app tracking: checked at least every 5 s, runs in the tray, counts only while present (lock or sleep stops it) | P0 | New | US-8.1; R-37..R-39; near-zero CPU |
| ACT-02 | Windows browser sites: registrable domain from the window title and the address bar through UI Automation (Chrome, Edge, Firefox, Brave) | P0 | New | US-8.1; R-38; D-22 |
| ACT-03 | Smart game detection on Windows: game-library folders (Steam, Epic, GOG, Xbox, Battle.net, EA, Ubisoft), launch by a known launcher, full-screen or borderless with sustained high GPU use; a "Is {app} a game? Yes / No / Neutral" notification whose answer becomes a usage rule | P0 | New | US-8.3; R-40 |
| ACT-04 | Android app tracking through usage access (with an explanation screen); system category Game = Gaming; social apps by package from the default rules; runs in the foreground service | P0 | New | US-8.2; R-38..R-40 |
| ACT-05 | Android browser sites through an opt-in accessibility service that reads only the address bar of known browsers; without it, only apps are tracked | P0 | New | US-8.2; R-38 |
| ACT-06 | Recently seen apps (this device only, last 7 days) with one-tap classification | P0 | New | US-8.4; R-38 |
| ACT-07 | Usage rules per device: app or domain → Gaming / Social Media / Ignore, shipped defaults plus user additions, a toggle per rule; YouTube "Shorts only" option | P0 | New | US-8.4, US-8.1; R-40 |
| ACT-08 | Privacy: only per-day, per-class totals (each tied at most to the session it overlapped) leave the device; raw samples kept at most 7 days locally; a clear explanation of what is collected | P0 | New | US-8.5; R-41, principle 11 |
| ACT-09 | Browser extension reporting the active tab's domain to the desktop app over native messaging | P2 | New | D-22 |
| ACT-10 | Tracking toggle per device (on, paused, off) with a clear indicator while active | P0 | New | US-8.6; R-37 |

### 5.15 Credits (CRED)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| CRED-01 | Earn credits for Productive time, live while a Productive session runs | P0 | New | US-7.1; R-42, R-45 |
| CRED-02 | Spend credits for Leisure sessions and tracked usage, with no double charging; live balance on the main screen, the Android notification and the widget | P0 | New | US-7.2, US-7.3; R-43, R-45 |
| CRED-03 | Credit notifications: low, zero, below-zero reminders | P0 | New | US-10.3; R-46; never blocks |
| CRED-04 | Ledger (why the balance changed) and a balance-over-time line on the stats page | P0 | New | US-7.6, US-11.4; R-44 |
| CRED-05 | Credit settings: earn, gaming, social and other-leisure rates, effective from the moment they are saved | P0 | New | US-7.6, US-12.1; R-44, D-15 |
| CRED-06 | *Removed 2026-10-24:* "timer still running while on {subject}" notification (R-47) | - | - | |
| CRED-07 | Manual credit adjustment with a note | P2 | New | |
| CRED-08 | Balance display: whole credits, negative in red with a minus sign, equivalent time left per class | P0 | New | US-7.4, US-7.5; R-44 |

---

## 6. Domain model (storage-agnostic)

IDs are opaque strings that **clients can generate** (time-ordered UUIDs recommended), so offline-created objects keep their ID. All instants are stored in UTC.

| Entity | Fields | Invariants |
|---|---|---|
| **User** | id, email (unique, case-insensitive), email verified at?, password hash?, Google subject?, created/updated | A password hash or a Google link (or both) |
| **EmailToken** | id, user, purpose (verify email / reset password / change email), token hash, new email?, expires, used at? | Single use; only hashes stored; verify 24 h, reset 1 h |
| **AccountPreferences** | user, timezone (IANA), week start, count weekends, time format, theme, notification toggles, onboarding done? | One row per user |
| **Device** | id (generated on install), user, name, platform, app version, push token?, created, last seen | |
| **Credential** (refresh token) | id, device, user, token hash, family ID, issued, expires, revoked | Only hashes stored; reuse of a rotated token revokes the whole family |
| **Tag** | id, user, name, name key, category (productive / leisure / neutral), distraction class (gaming / social, leisure tags only)?, archived?, created/updated, deleted? | Unique (user, name key) among non-deleted tags |
| **Session** | id, user, started at, ended at (empty = running), timezone, title?, summary?, tag?, source (timer / manual / import), device, created/updated, deleted at? | At most one running per user; no overlaps per user; end > start; title ≤ 200, summary ≤ 2000 |
| **GoalSetting** | user, kind (daily / weekly / monthly), minutes or unset, remembered minutes, effective from (day key) | One effective value per (user, kind, day) |
| **Achievement** | user, kind, period ID, achieved at, productive minutes, target minutes, notified devices? | Unique (user, kind, period ID) |
| **CreditRates** | user, earn, gaming, social, other-leisure (credits per hour), effective from (instant) | One effective value per (user, instant) (R-44) |
| **UsageTotal** | user, device, day key, class (gaming / social), overlapped session?, seconds, updated | Unique (user, device, day, class, overlapped session); built only from increments (R-41) |
| **ProcessedCommand** | user, command ID, result, created | Kept at least 30 days (R-34) |
| **Revision** | user, current revision; every change record stores its revision | Increases with every change |
| **DailyAggregate** (derived) | user, day key, productive / leisure / neutral seconds, gaming / social seconds, credits earned / spent, balance at end of day, daily goal met | Rebuildable; updated in the same transaction as every change it depends on (R-54) |
| **LedgerEntry** (derived) | user, date, source (session + day / usage total / recalculation), category or class, seconds, credits (2 decimals), cause (for recalculations: the change that triggered it) | Append-only; a rebuild from sessions, usage totals, tags and rates gives the same balance (R-44) |
| **CreditAdjustment** (P2) | id, user, credits (±), note, created | |
| *Client-side only:* **SyncIssue** | command, error, created | Shown until resolved |
| *Client-side only:* **ForegroundSample** | device, subject kind (app / domain), subject ID, class?, at | Never uploaded; deleted after 7 days (R-38) |
| *Client-side only:* **UsageRule** | id, subject kind, subject ID, class (gaming / social / ignore), enabled, origin (default / user / suggestion) | Per device; defaults come from the shipped rules file (R-40) |

Statistics, streaks and credit balances are **not stored as source data**: they are computed from Session, UsageTotal, Tag, GoalSetting and CreditRates (principle 7). DailyAggregate and LedgerEntry exist so any month loads quickly; they can be dropped and rebuilt at any time.

---

## 7. Operations & events (contract at capability level)

One contract source defines every operation, event and error. Server validation and the typed client are **generated from it**. Every incoming message is validated, including realtime messages.

### 7.1 Conventions

- Every response carries **server time**; every write carries a **command ID** (R-34) and, when replayed from the outbox, its occurred-at time.
- Errors have one shape: `code`, human-readable `message`, optional `details` (field errors, conflicting session ID) and `requestId`.
  Codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (overlap, name taken, stale revision), `RATE_LIMITED`, `UNAVAILABLE`, `INTERNAL`.
- Lists use cursor pagination. Durations are integer seconds; instants are ISO-8601 UTC; days are `YYYY-MM-DD`; credits are decimals with 2 places.
- Every resource access is checked against the authenticated user.

### 7.2 Operations

| Group | Operations |
|---|---|
| Auth | register, verify email, resend verification, login, sign in with Google, refresh, logout (this device), list devices, revoke device, change password, change email (+ confirm), request reset, reset password, get me, complete first sign-in (timezone), delete account |
| Timer | get timer; **start** (title?, tag?, startedAt? for offline replay); **pause** (endedAt? for offline replay); **update running** (title?, tag?); switch, discard (P2) |
| Sessions | list (range, tag?, category?, text?, cursor); get; create manual; update (title, tag, summary, start, end); delete |
| Tags | list; create (name, category; name taken → `CONFLICT`); rename; recategorize; set distraction class; archive; unarchive; delete (replacement tag or Untagged) |
| Goals | get current and history; set (kind, minutes or unset) |
| Preferences | get; update account preferences |
| Stats | **today snapshot** (running session, today's total and productive time, goals, streaks, balance); period stats (day / week / month: headline numbers, per-day stacked series, breakdowns by category and tag, tracked minutes, goal days); day timeline |
| Usage | **report increments** (batch; each increment by its command ID) |
| Credits | balance snapshot (balance, rates); ledger (range, cursor); balance series (range); get / set rates |
| Achievements | list recent / unnotified; mark notified (per device) |
| Push | register / clear this device's push token |
| Sync | state snapshot; changes since revision (including tombstones); subscribe to the event stream |
| Data | export all (JSON); export period (CSV: sessions, daily summary); import (legacy migration, P1) |
| App updates | latest version per platform (version, download URL, signature or checksum) |
| Health | `/health` (API and database status); liveness |

Commands and mutations return the resulting state **and the new revision**, so the caller needs no follow-up reads.

### 7.3 Events (server to all of the user's devices)

`timer.changed` (started, paused, title or tag changed), `session.upserted`, `session.deleted`, `tag.upserted`, `tag.deleted`, `goals.changed`, `preferences.changed`, `achievement.unlocked` (goal reached), `credits.changed` (new balance snapshot), `credentials.revoked` (forces sign-out on that device). Every event carries the revision. Clients never send state over the realtime channel; they send commands through the normal operations.

---

## 8. Sync, realtime & offline model

### 8.1 Sources of truth

- **Server:** sessions (including the running session), tags, goals, preferences, credit rates, usage totals, achievements, and everything derived from them.
- **Client:** a per-user local copy (cache plus outbox) that renders the UI instantly and offline; plus device-only data that never leaves it: usage rules, foreground samples, device settings.

### 8.2 Clock

- At connect, and periodically, the client estimates `offset = serverTime − (clientTime + rtt/2)` and keeps a smoothed value.
- Display uses `now = deviceNow + offset`. The ticker runs at 1 Hz aligned to second boundaries; nothing per-second goes over the network.
- Times recorded offline use `deviceNow + lastKnownOffset` (R-03).

### 8.3 Write path

1. A user action creates a command with an ID and occurred-at time, applies it **optimistically** to the local copy, and appends it to the **durable outbox** (per user).
2. The outbox sends commands one at a time, in order, with retries and exponential backoff with jitter. It pauses while offline and resumes on reconnect or when the app returns to the foreground.
3. Success: the server result and revision replace the optimistic state.
4. Rejection (validation or conflict): roll back the optimistic change and create a **sync issue** (R-36). The outbox then continues with the next command, or holds dependent commands; for example, an edit of a session whose create was rejected also becomes an issue.
5. Lost response: retrying the same command ID returns the original result (R-34); no duplicates.
6. The UI shows "Offline – will sync" while the outbox is not empty (SYNC-04).

### 8.4 Read path

- On start: render from the local copy.
- On (re)connect: fetch the **state snapshot** and the **changes since** the stored revision, apply them, then apply live events (SYNC-07).
- While connected: apply events with a higher revision; a gap triggers a change-feed fetch.
- The realtime channel authenticates at connect, is re-authenticated when credentials rotate, and is closed by the server on revocation. Clients reconnect with backoff.

### 8.5 Conflict policy

| Situation | Outcome |
|---|---|
| Two devices start at about the same time | The first start wins; the second gets the running session back (no-op) and shows it |
| The same field changed on two devices (offline edit vs online edit) | Latest action wins by corrected occurred-at time (R-49) |
| Offline device A records a session that overlaps a session made on device B | A's create is rejected as `CONFLICT`; a sync issue shows both sessions with options to adjust or discard |
| Pause arrives for a session already paused elsewhere | No-op; the client adopts the server state |
| A dialog is open on device A when device B pauses or starts | A's dialog closes and saves what was entered (R-48) |
| Edit of a session deleted elsewhere | `NOT_FOUND` creates a sync issue (offering to recreate it as a manual entry) |
| Tag deleted elsewhere while queued commands reference it | The server applies the deletion's replacement tag (or Untagged) and reports a warning, not a rejection |
| Usage increment referencing a session deleted elsewhere | Stored as usage outside a session (R-41) |

### 8.6 Account isolation on a shared device

The local copy, outbox and caches are keyed by user. Signing out closes the realtime channel and clears in-memory state; a user's outbox stays stored until that user signs in again (or is explicitly discarded). Nothing is ever read from another user's storage.

### 8.7 Where the client core runs

- **Desktop:** the client core (outbox, cache, realtime connection, clock, tracker, live balance, notifications) runs in the native process, not in the UI. Closing to tray **destroys the window and its web view**; only the tray and the core keep running, which keeps memory low all day. Reopening recreates the window from the local copy.
- **Android:** the same core runs inside the **foreground service** behind the persistent notification, which runs while a session is running or tracking is enabled. The service tracks usage and keeps the realtime connection open, so the phone reflects changes from the PC immediately. When the service is not running, the app catches up through the snapshot and change feed when opened, and FCM delivers goal-reached notifications (NOTIF-04).

### 8.8 Activity pipeline

1. The platform tracker samples the foreground app (desktop: foreground window, process and UI Automation for browsers; Android: usage events, plus the accessibility service if enabled) and reports to the core.
2. The core stores samples locally (R-38), skips time while the user is not present (R-39) and classifies each sample with the device's rules (R-40).
3. The core accumulates tracked seconds per class, splitting at local midnight and at session boundaries, and sends **increments** through the outbox at most every 60 s (R-41). Idempotency (R-34) makes resends safe.
4. The core updates the live balance (R-45) and raises credit notifications locally (R-46), online or offline.
5. The server adds increments to usage totals, appends their ledger entries (plus recalculation entries when a late increment changes earlier credits, R-44), updates the balance, and sends `credits.changed` to the user's devices.

---

## 9. Non-functional requirements

### 9.1 Security (each item answers a defect class found in the legacy app, or a PRD requirement)

- Validate **every** input, including realtime messages and query parameters; reject unknown fields; compare with type-safe queries (no operator or structure injection).
- Never relay raw client payloads to other devices; a malformed message must never crash the process.
- Authorisation on every resource (owner check); every query scoped to the authenticated user; no client-chosen routing targets.
- Passwords hashed with Argon2id; password length 8-128.
- Refresh credentials are random, stored as HMAC hashes, rotated on use, with family reuse detection; per-device revocation; logout revokes on the server. Access tokens are short-lived and signed.
- Email tokens (verification, reset, email change) are single-use, stored hashed, and expire (Appendix A); reset and password change revoke the other devices.
- Login errors identical for unknown email and wrong password (including timing); reset and resend never reveal whether an email exists; rate limits per IP and per account on auth operations, including resend (once a minute).
- Google sign-in: authorization code with PKCE and a loopback redirect on Windows; the server verifies the Google ID token (issuer, audience, expiry) before linking or creating an account.
- Configuration refuses weak or placeholder secrets; CORS allow-list and proxy trust are configurable; no wildcard origins by default.
- HTTPS and WSS in production (reverse proxy, OPS-06).
- Desktop: content security policy, navigation and new-window guards, no developer tools or menus in production, credentials in OS secure storage.
- Android sideloading: release APKs are signed with a key kept offline and backed up; the in-app updater installs only APKs signed with the same key, downloaded over HTTPS.
- Activity data: only usage totals leave the device (principle 11); usage totals are covered by export and account deletion. Account deletion is a hard delete.
- No secrets in the repository; see Appendix C for legacy credentials that must be rotated.

### 9.2 Reliability

- Write paths that touch several records are transactional, including the recalculation of derived data (R-54).
- Graceful shutdown, request timeouts, database connection timeouts, a health check that includes the database.
- Versioned database migrations, applied automatically on server start; never rely on implicit schema changes.
- Backups documented and a restore tested (OPS-02).
- Client: global error boundary; every failure reaches the feedback layer (toast, banner or sync issue).

### 9.3 Performance budgets

| Metric | Budget |
|---|---|
| Start/pause visual feedback | < 100 ms (optimistic) |
| Cross-device propagation | p95 < 1.5 s (target about 1 s) |
| Desktop cold start to interactive | < 1.5 s |
| Android cold start to timer visible | < 1 s (PRD ceiling: 2 s on both apps) |
| Stats for any month | < 500 ms; p95 < 300 ms over 5 years of data (about 20k sessions) |
| Idle CPU with the timer running | Near zero; 1 Hz redraw of the clock only (not the whole screen) |
| Network while idle | Heartbeat only; usage increments at most once a minute while tracked usage happens |
| Charts and other heavy views | Loaded on demand, not in the first bundle |
| Windows installer size | < 15 MB |
| Android APK size (64-bit ARM) | < 15 MB, including the FCM client |
| Android service memory, idle with the timer running | < 50 MB PSS (new row from T0.7) |
| Desktop memory, closed to tray with the timer running | < 50 MB |
| Activity tracking cost | Desktop: one foreground check every 5 s (UI Automation only when a browser is in front); no measurable CPU at rest. Android: usage events checked at most every 5 s and only while the screen is on; no wake-ups while it is off |

**Measured in T0.7** (2026-10-25, hello-world builds, release, Ryzen 7 5700G, Windows 11; task file `docs/tasks/T0.7.md` has the methods):

| Metric | Measured | Verdict |
|---|---|---|
| Windows installer (NSIS) | 1.43 MiB (installed 6.05 MB) | Budget confirmed, large headroom for the core and the real UI |
| Desktop cold start to first contentful paint (proxy for "interactive": the Svelte UI mounts before first paint) | 474 ms median | Budget confirmed (warm file cache; not measured after a reboot) |
| Desktop memory, window destroyed, process alive | 3.9 MB private (empty shell, no core or tray; measured on a throwaway spike build, not in the repo) | Budget confirmed **only if closing to tray destroys the window** |
| Desktop memory, window minimized or hidden | 74 to 76 MB (7 processes; window open and idle 72 MB) | Over budget: DESK-02 must destroy the window on close, never `window.hide()` |
| Android APK (arm64, with FCM) | 2.06 MB unsigned | Budget confirmed, about 13 MB headroom for Material 3, Navigation, Glance and features. FCM was only linked and initialised with dummy options; no real `getToken` was measured |
| Android cold start to first frame (proxy for "timer visible") | 543 ms median on an x86_64 emulator | **Not confirmed**: no arm64 device here; re-measure on the owner's phone before the first release |
| Android service memory, idle | 19.4 MB PSS on the emulator, activity backgrounded not destroyed (includes some UI), no timer running | The < 50 MB PSS row is a proposal, not yet an owner decision; the hello-world figure passes it. Re-measure on a phone with the real core and a running timer |

Re-measure memory and cold start once the tray, core and sync run (M3 and later); the hello-world figures are floors, not forecasts. Not resolved by the spike: the rustls provider choice (aws-lc-rs about +1.55 MB over ring, T0.4) needs the sync client, which does not exist yet; decide it when the first network code lands.

### 9.4 Accessibility (WCAG 2.2 AA baseline)

- Dialogs and popovers: proper roles, labelled title, focus trap, Esc closes, focus returns. The session dialogs' countdown is announced once, not every second, and stops on any interaction (R-48).
- Everything is keyboard-operable: cards, chips, menus, charts (data table alternative).
- Visible focus; categories and negative balances are never conveyed by colour alone (name, sign or icon too); touch targets ≥ 44 px on mobile.
- Brand violet used for text only at AA-compliant lightness; category colours meet contrast against their surfaces.
- Announce timer state changes (started / paused) and sync status politely; never announce every second.
- Honour reduced motion.

### 9.5 Observability

- Server: structured logs with request IDs and user IDs only (no other personal data); error tracking; `/health`; metrics (P2).
- Client: a rotating local log file that can be exported from About (SET-05); sync-failure diagnostics in the sync-issues view.

---

## 10. UX & design

### 10.1 Information architecture

Timer-first shell, four destinations:

```
+--------------------------------------------------------------------------+
| [Deep Work] Spec review   00:42:10   Today 5:12:40   [Pause]   +34   o   |
+----------+---------------------------------------------------------------+
| Today    |                                                               |
| History  |               (screen content)                                |
| Stats    |                                                               |
| Settings |                                                               |
+----------+---------------------------------------------------------------+
```

- **Persistent timer bar** (TIM-09) on every screen except Today: tag chip and title (tap to edit while running), current session timer, day total, Start/Resume or Pause, credit balance, sync status.
- Navigation keeps per-screen state (period, filters, scroll) and remembers the last screen.

### 10.2 Screens

| Screen | Content |
|---|---|
| **Today** (main screen) | Current session timer and day total timer (which is larger: D-02), title and tag chip (tap to edit while running), one primary Start/Resume or Pause button, today's productive time vs daily goal (progress bar), credit balance with the equivalent time left, current and best streak (US-5.1, US-10.1, US-10.2). |
| **History** | Sessions grouped by day with day totals; midnight-crossing sessions as one row per day; edit, delete (with confirmation), "Add session"; virtualised list; loading, empty and error states with retry (US-5.5). |
| **Stats** | Day / Week / Month with previous/next. Headline numbers (productive hours largest, total, productive share, goal progress); day timeline or per-day stacked bars with the daily-goal line; goal progress bars for all three goals; breakdowns by category and tag plus tracked Gaming and Social minutes; month heatmap of goal days; current and best streak; balance-over-time line and ledger; session list with tag/category filters and text search; CSV export (US-11.1..US-11.6). |
| **Settings** | Sections per US-12.1: Account (email, password, Google link, devices, export, delete account), Time (timezone, week start), Tags (create, rename, recategorize, archive, delete with replacement, link class), Goals (three goals, count weekends), Credits (four rates, balance and ledger link), Tracking (this device: on/paused/off, usage rules, recently seen apps, Android permission status), Notifications (one toggle per type), Appearance (theme), Desktop (this device: launch at startup, global shortcut, mini window), About and server URL. |
| **Auth** | Sign up; "check your email" with Resend; sign in (email or Google); forgot password and reset; show-password toggle; inline field errors; loading states; banner when the session has expired; "Advanced: server URL" (P1). First sign-in setup: confirm timezone. Android: permissions onboarding after it (MOB-06). |
| **Overlays** | Start dialog and summary dialog with countdown (R-48); confirmations (delete session, delete tag with replacement, recategorize, delete account with typed DELETE); goal-reached toast; sync-issues panel. Native notifications: credit low / zero / below zero, goal reached, game suggestion with Yes / No / Neutral actions. |

### 10.3 Key flows

1. **Start:** press Start/Resume (or the shortcut, or the tray, widget or notification). The clock starts at once. The start dialog opens pre-filled from the last session; doing nothing for 5 s keeps those values, typing cancels the countdown.
2. **Pause:** press Pause. The session ends at that instant. The summary dialog opens; doing nothing for 5 s saves without a summary.
3. **Break then resume:** Start/Resume after a break; the dialog is pre-filled with the same title and tag, so zero input continues the same task.
4. **Fix a mistake:** edit or delete any session in History or the stats session list; overlaps are explained inline ("Overlaps 10:05-10:40 Spec review"); totals, goals, streaks and credits update.
5. **Offline:** everything works; "Offline – will sync" shows while changes are queued; rejected changes appear as sync issues with clear options.
6. **Midnight while running:** the day total resets at local midnight; the current session keeps counting; history shows the session in both days.
7. **Cross-device:** pausing on the PC shows paused on the phone within about a second, and closes any open dialog there.
8. **Spending credits:** while gaming or scrolling is tracked, the balance ticks down; at 10 minutes left, at 0 and every 15 minutes below 0 a notification appears; nothing is blocked.

### 10.4 Design system rules

- **Semantic tokens from one source** (surfaces 0-3, border, text primary/secondary/disabled, accent, success/warning/danger, focus ring, **category colours**: Productive green, Leisure orange, Neutral blue), generating light and dark themes. Brand violet `#7C3AED` (legacy brand) stays the accent; text use is tuned for contrast. Negative balances use the danger colour.
- **Typography:** one family; tabular numerals for every time and credit display; a clear scale with at most two weights per view.
- **Spacing** on a 4 px grid; comfortable and compact density (compact for the mini window).
- **Restraint:** no per-card glows or heavy blur; hierarchy comes from size, weight and space. A single focal accent on the running timer is acceptable.
- **Components to own:** Button (including a solid destructive variant), IconButton, Input, Textarea, DurationInput, Select/Combobox (tag picker with search and create), Switch, Checkbox, SegmentedControl, Dialog (including the session dialog with countdown), Drawer, Popover, Toast (with actions), Tooltip, TagChip (category colour), ProgressBar, List/Table (virtualised), EmptyState, Skeleton, Banner; charts: stacked bars with a reference line, day timeline, calendar heatmap, line chart.
- **Theme before first paint**, including the native window background colour.
- Minimum desktop window about 480×640; layout adapts to width.
- Correct plurals ("1 day"); one date/time format system that follows the 12/24 h and locale settings.

---

## 11. Tech stack (decided 2026-10-24)

The legacy stack was intentionally **not** assumed. Each layer was chosen against these requirements, with small size and speed (principle 10) as the tie-breaker.

| Layer | Must provide |
|---|---|
| Server runtime | Long-lived realtime connections next to request/response; a strong timezone library with the IANA database; schema-validated contract generation; small memory footprint; runs as one container |
| Database | Transactions; unique and partial-unique constraints (one running session per user); indexed range scans by (user, time); group-by aggregation; simple backup; runs as a bundled container or an external service |
| Contract | One schema source that generates server validators, a typed client and mocks; validates realtime messages too |
| Client core | Shared by desktop and mobile; no UI dependency; injected clock, storage, transport and connectivity; deterministic tests with a fake clock |
| Local persistence | Durable, transactional per-user store for cache, outbox and foreground samples; survives crashes |
| UI | Accessible primitives (or the ability to build them), charts, list virtualisation, theming via tokens |
| Desktop shell | Tray with dynamic icon and menu; global shortcuts; autostart that starts hidden; lock and sleep events; native notifications with actions and click handling; single instance; OS secure storage; signed auto-update; a second always-on-top window; small resident footprint (it runs all day) |
| Mobile shell | Android foreground service / persistent notification with actions; home-screen widget; secure storage; reliable background resume; push |
| Activity tracking (desktop) | Foreground window and process; reading a browser's address bar; lock and sleep events; GPU usage and process parentage for game signals |
| Activity tracking (Android) | Usage events with app categories; an optional accessibility service; a long-running foreground service |
| Accounts | Outgoing email; Google sign-in on Windows and Android |
| Deployment | One Compose file: server, optional bundled database, optional reverse proxy with automatic HTTPS |
| Tooling | One language version per language, one formatter and one set of non-overlapping linters per language (T0.2: Prettier + ESLint + dependency-cruiser; rustfmt + clippy; ktlint + detekt + Android Lint), reproducible lockfiles, CI building every target |

Decision record:

| Layer | Choice | Why | Alternatives rejected |
|---|---|---|---|
| Server runtime | **NestJS** (TypeScript, Node.js LTS); time math on the TC39 Temporal API (`temporal-polyfill` until Node ships it, ADR-0004) | Owner's decision; structured modules, shares the TypeScript contract package; Temporal shares jiff's semantics | - |
| Database | **PostgreSQL** (decided 2026-10-24) | Exclusion constraint on time ranges enforces "no overlapping sessions" (R-05) in the database; partial unique index for one running session; strong range and aggregation queries; the official image fits the PRD's bundled container and any managed external database | SQLite (no exclusion constraints, no external option), MongoDB (legacy; weak for these invariants) |
| Data access | **Kysely** (D-20, decided 2026-10-24) | Typed SQL; allows the raw SQL migrations the exclusion constraint needs | Prisma (no exclusion constraints in its schema), TypeORM |
| Realtime transport | **Plain WebSocket** (NestJS `ws` adapter), one room per user | Lower per-message overhead; easy to use from Rust | Socket.IO (extra protocol, weak Rust clients) |
| Contract / schema | **One TypeScript schema package** (`packages/contract`, zod; ADR-0003, accepted 2026-10-25) emitting OpenAPI 3.0 + JSON Schema; NestJS validates from it; Rust types and client generated with `progenitor` / `typify` (`crates/contract-types`) | One source for server, desktop and Android | Hand-written types per client |
| Email | **Nodemailer** over SMTP (Gmail with an app password by default; host and port configurable) | Owner's choice (PRD); no extra service to run | Hosted email APIs (another account for self-hosters) |
| Google sign-in | Server verifies Google ID tokens and links accounts by email; Windows: system browser, authorization code + PKCE, loopback redirect; Android: Credential Manager. Exact OAuth client setup in an ADR during T1.6 | Works for a sideloaded app and a desktop app without embedding a browser | Embedded web views (blocked by Google) |
| Push | **FCM HTTP v1** from the server; `firebase-messaging` on Android; optional (D-23) | Owner's choice (PRD); reaches the phone when the service is not running | A self-hosted push service (no reliable delivery on Android without Google Play services' channel) |
| Client core | **Rust** shared by both apps: `tokio`, `reqwest` + `tokio-tungstenite` (both with `rustls`), `rusqlite` (bundled SQLite), `jiff` (embedded timezone database), `uuid` v7, `serde`; tests with `proptest` | Written once; runs without any UI; small native binary | TypeScript core (would have to be rewritten in Kotlin for the Android background service) |
| Desktop shell | **Tauri 2** with official plugins: tray, global-shortcut, autostart, notification, single-instance, updater, window-state; `windows` crate for the foreground window, UI Automation, lock and sleep events and GPU counters; `keyring` for credentials | Small installer and memory footprint; direct Windows API access from Rust; window can be destroyed in tray | Electron (80-150 MB installer, high resident memory, native add-ons needed anyway) |
| Desktop UI | **Svelte 5** + TypeScript + Vite; **Bits UI** primitives; **Tailwind CSS v4** over CSS-variable tokens; **TanStack Virtual**; `Intl` for formatting | No runtime virtual DOM, smallest output, only the clock text updates each second | React + React Aria (acceptable, slightly heavier) |
| Mobile | **Native Kotlin + Jetpack Compose** (foundation + selective Material 3), Navigation Compose, Coroutines/Flow, Glance for the widget, no DI framework; Rust core through **UniFFI** + `cargo-ndk`; Android Keystore for credentials; Baseline Profiles + R8 full mode; 64-bit ARM APK; minSdk 26 (D-26); **sideloaded** with an in-app updater (`PackageInstaller`) | Smallest APK, fastest start, most reliable long-running background service; Kotlin is required for usage access and the accessibility service anyway | React Native / Flutter (extra runtime size; JS/Dart engine tied to the UI, so background work needs a separate path), Tauri on Android (unproven that the core keeps running in a foreground service with no window) |
| Local persistence | SQLite inside the Rust core (cache, outbox, foreground samples, usage rules) on both platforms | One implementation, transactional, survives crashes | Room / IndexedDB (per-platform duplicates) |
| Charts | **uPlot** (desktop), **Vico** (Android) | Small and fast; each paired with a data-table view for accessibility | Heavier chart suites |
| Browser site detection (Windows) | **UI Automation** reading the address bar of Chrome, Edge, Firefox and Brave, plus the window title (D-22) | Owner's choice: nothing to install; tests catch browser UI changes | Browser extension + native messaging (moved to P2, ACT-09) |
| Deployment | **Docker Compose**: server image; bundled PostgreSQL under a profile, used when `DATABASE_URL` is empty; **Caddy** under a profile for automatic HTTPS | One command on a fresh VPS (PRD §3) | Hand-installed services |
| Testing / E2E | Rust: `cargo test` + `proptest`; desktop UI: Vitest; desktop E2E: WebdriverIO + `tauri-driver`; Android: Compose UI tests + **Maestro**; server: integration tests against a real database; shared fixtures for time and credit math (D-19) | | |
| Repo / tooling | **pnpm workspace** (server, contract, tokens, desktop UI) + **Cargo workspace** (core, core FFI, desktop shell) + Gradle Android project building the core through `cargo-ndk` | | |
| CI / release | **GitHub Actions** (D-28, decided 2026-10-25): one workflow runs `scripts/check.mjs` per group as separate jobs (docs, TypeScript and Android on Linux, Rust on Windows) behind one required `ci` check; a ruleset on `main` blocks pull requests on red CI. Release jobs: T0.7 | The repository is on GitHub; free Windows and Linux runners for a public repository; the same script locally and in CI | Other hosted CI (a second service to trust with signing secrets) |

---

## 12. Task distribution

Re-planned 2026-10-24 to follow the PRD's delivery phases (M1-M7 = phases 1-7). Only T0.1 had started; the pre-PRD milestone tasks (old M1-M6) were never started, so their IDs were reused for this plan instead of being retired (the old plan is at commit `689caa1`). Older notes that cite a task ID above T0.7 from before 2026-10-24 refer to that old plan.

### 12.1 Workstreams

| WS | Name | Owns | Main features |
|---|---|---|---|
| WS0 | Foundations | Repo, tooling, contract, decisions | - |
| WS1 | Server platform | Schema, migrations, config, errors, logging, preferences, mail | OPS-03, OPS-04, OPS-07, SET-02/03 |
| WS2 | Auth & accounts | Credentials, verification, Google, devices, account management | AUTH-* |
| WS3 | Timer & sessions | Commands, session CRUD, tags and categories | TIM-*, LOG-*, TAG-* |
| WS4 | Goals & stats | Goals, streaks, aggregates, stats, achievements, export | GOAL-*, INS-*, LOG-08 |
| WS5 | Realtime & change feed | Event stream, revisions, change feed, snapshot | SYNC-01, SYNC-07 |
| WS6 | Client core | Transport, clock, projection, outbox, cache, sync status | SYNC-*, AUTH-03/04 |
| WS7 | Design system | Tokens, primitives, theming | SET-01, X-01 |
| WS8 | App UI | Desktop screens and flows | All UI-facing features |
| WS9 | Desktop shell | Tray, autostart, shortcut, notifications, mini window | DESK-*, NOTIF-* |
| WS10 | Mobile | Android shell, screens, service, widget | MOB-* |
| WS11 | Ops & release | Image, compose, proxy, CI/CD, signing, updates, backups | OPS-*, DESK-06, MOB-05 |
| WS12 | Quality | Test suites, security, accessibility and performance passes | X-01, X-03 |
| WS13 | Activity & credits | Trackers, classification, usage totals, credit ledger | ACT-*, CRED-* |

**Parallel lanes.** Once the contract (T0.4) and time math (T0.5) exist:

- **Lane A (server):** WS1-WS5.
- **Lane B (clients):** WS6-WS8 and WS10, working against generated mocks.
- **Lane C (shell & ops):** WS9 and WS11.

Lanes meet at the end of each milestone for integration. WS12 runs alongside all lanes. Each milestone ends with both apps working against a real server.

```
M0 Foundations --> M1 Accounts & deployment --> M2 Core timer --> M3 Sync & offline
  --> M4 Tags, goals & stats --> M5 Credits & notifications --> M6 Activity tracking
  --> M7 Platform features & release (v1) --> Backlog (P2)
```

### 12.2 M0 - Decisions & foundations

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T0.1 | Resolve the open decisions (section 13) and choose the stack (section 11); record each decision. *Stack chosen 2026-10-24; D-19, D-20 decided 2026-10-24; the owner's PRD (2026-10-24) settled D-03..D-07, D-10, D-11, D-15..D-18, D-21..D-23; the owner accepted the recommendations for PostgreSQL, D-08, D-12..D-14, D-24 and D-25 on 2026-10-24. D-02 is a design decision taken at T2.6, not here* | WS0 | - | all | Decision record complete; this spec updated |
| T0.2 | Repo scaffold organised by module boundaries (`docs/ARCHITECTURE.md`); formatter, linter, type checks; one language version; config templates including `infra/.env.example` | WS0 | T0.1 | - | A fresh clone installs and passes all checks with one command |
| T0.3 | CI: reproducible install, lint, type check, tests, build of every target; required on the main branch | WS0/WS11 | T0.2 | - | Pull requests blocked on red CI |
| T0.4 | Contract: operations, events and error model of section 7, generating server validators, a typed client and a mock server; full schemas for the operations whose shapes the spec already fixes, the rest named only (D-29) | WS0 | T0.2 | §7, D-29 | Server stub and client both compile against it; mock server runs; every generated file lives under a `generated/` folder or starts with an `@generated` comment line (so agent guards refuse hand edits) |
| T0.5 | Time-math module (server and core) with the shared fixture suite (D-19): day keys, period ranges with week start, clipping across midnight and per-day history rows, period IDs; injected clock | WS6 | T0.2 | R-10..R-14, R-16..R-18 | Fixtures green in both implementations for UTC, America/Los_Angeles, Asia/Dhaka, Pacific/Auckland, Asia/Kathmandu, and 23 h / 25 h DST days |
| T0.6 | Local development environment: database, server, a mail catcher for verification emails and seed data with one command | WS11 | T0.2 | - | New contributor running in < 10 min |
| T0.7 | Size spike: hello-world Tauri 2 + Svelte installer, and Kotlin + Compose APK (with the FCM client) loading the Rust core through UniFFI, plus a foreground service that keeps the core running with no activity | WS0 | T0.2 | §9.3 | Measured sizes, memory and cold start recorded in section 9.3; budgets confirmed or adjusted |

### 12.3 M1 - Accounts & deployment (PRD phase 1)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T1.1 | Schema and migrations for accounts: users, email tokens, devices, credentials, preferences, tags with categories, revisions, processed commands; migrations run on server start | WS1 | T0.4 | §6 | Migrations apply automatically on start and roll back on an empty database |
| T1.2 | Server platform: config validation (Appendix A variables), error model, request IDs, structured logs, `/health` with database status, graceful shutdown, timeouts, CORS and proxy settings | WS1 | T0.4 | OPS-03, OPS-04 | Bad config fails fast with a clear message; every error has the standard shape |
| T1.3 | Deployment: server image (non-root) and Compose file with the bundled database profile, `DATABASE_URL` switch, named volume, optional Caddy profile for `DOMAIN`; README first-deploy section | WS11 | T1.2 | OPS-01, OPS-06, OPS-02 | On a clean VM, `docker compose up -d` gives a working server with the bundled database; with `DATABASE_URL` set it uses the external one; smoke test in CI |
| T1.4 | Outgoing email: SMTP transport, templates (verify, reset, email change, account deleted), Appendix B copy | WS1 | T1.2 | OPS-07 | Emails arrive in the dev mail catcher; a failed send is logged and reported, never silent |
| T1.5 | Auth core: register, email verification and resend (rate limited), login refused until verified, refresh rotation with reuse detection, logout this device, rate limits, uniform errors; first sign-in setup with starter tags | WS2 | T1.1, T1.4 | AUTH-01, AUTH-02, AUTH-10, AUTH-12, TAG-07, US-4.1, US-4.3, US-6.1 | Security tests: reusing a token revokes the family; login errors are uniform; expired or used links are refused |
| T1.6 | Google sign-in: verify ID tokens, link by email, Google = verified; desktop loopback + PKCE and Android flows; ADR for the OAuth client setup | WS2 | T1.5 | AUTH-11, US-4.2 | Google sign-in works on Windows and Android; an existing email account is linked, not duplicated |
| T1.7 | Account management: devices list and revoke, change password, change email with re-verification, password reset, delete account (typed DELETE + password or Google re-auth, hard delete, confirmation email), JSON export | WS2 | T1.5 | AUTH-05..AUTH-08, AUTH-13, US-4.3..US-4.7 | Reset signs out other devices and never reveals whether an email exists; deletion leaves no row of the user behind |
| T1.8 | Rust client core v0: transport with timeouts and normalised errors; single-flight credential refresh; secure-storage port; clock-offset estimator; 1 Hz second-aligned ticker | WS6 | T0.4, T0.5 | AUTH-03, SYNC-05, TIM-10 | Unit tests with fake clock and simulated skew |
| T1.9 | Design tokens (including category colours) and base primitives (Button, IconButton, Input, Dialog, Popover, Toast, Skeleton); theme before first paint | WS7 | T0.2 | SET-01, TAG-04, X-01 | Light/dark render without flash; primitives pass keyboard and screen-reader checks |
| T1.10 | Desktop shell v0 (Tauri 2): window with minimum size and remembered position, single instance, production hardening (no developer tools or menus, CSP, navigation guards), secure storage; client core in the native process; close to tray (window destroyed) with Open / Quit | WS9 | T0.2 | DESK-02, DESK-07, DESK-08 | Installer runs on Windows within the size budget; closing the window keeps the core running in the tray |
| T1.11 | Desktop auth and account screens: sign up, check-your-email with resend, sign in (email, Google), forgot / reset, first sign-in timezone confirmation, server URL, Settings → Account | WS8 | T1.5..T1.10 | AUTH-01..AUTH-13, SET-02, SET-04 | Demo: sign up, verify, sign in with email and with Google, change password, export, delete account |
| T1.12 | Android app v0: Kotlin + Compose using the core through UniFFI; Keystore credentials; navigation; the same auth and account screens; short note on legacy mobile-only behaviour (foreground service, battery prompts, signing) | WS10 | T1.5..T1.9, T0.7 | MOB-01, AUTH-01..AUTH-13 | The T1.11 demo works on a device |
| T1.13 | Quality: auth integration tests and a security pass on auth (token reuse, rate limits, enumeration, email-token reuse, Google token checks) | WS12 | T1.7 | §9.1 | No findings above low severity |

### 12.4 M2 - Core timer (PRD phase 2)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T2.1 | Sessions schema (one running, no overlap) and timer commands: start, pause, update running; idempotency store; per-user serialisation; revision bump; server timestamps | WS3 | T1.1 | TIM-01, TIM-10, R-01..R-05, R-34, R-53 | Property tests: any command sequence leaves ≤ 1 running session and no overlaps; replaying an ID returns the same result |
| T2.2 | Session CRUD: edit finished sessions, delete, manual add; overlap, future and minimum-duration validation; timezone capture | WS3 | T2.1 | LOG-03, LOG-04, LOG-05, R-04, R-05, R-08, R-09, US-5.5 | Conflict errors identify the overlapping session |
| T2.3 | Tag operations needed by the timer: list, create (name + category); pre-fill source (most recent session) | WS3 | T1.1 | TAG-01, TAG-02, R-29, R-50, R-07 | Unicode look-alike names collide and the conflict names the existing tag; pre-fill comes from the latest session on any device |
| T2.4 | Today snapshot and history: today's total and productive time, running session, history listing grouped by day with per-day rows for midnight-crossing sessions | WS4 | T2.1, T0.5 | TIM-04, LOG-01, LOG-07, R-11, R-17, R-51, US-5.4 | Totals match the shared fixtures, including sessions crossing midnight and DST days |
| T2.5 | Core: timer projection and commands with optimistic apply; both timers from the server start timestamp | WS6 | T1.8, T2.1 | TIM-01, TIM-04, R-17 | Fake-clock tests: start/pause feedback is immediate; midnight resets only the day total |
| T2.6 | Desktop main screen and session dialogs: two timers, title and tag chip (edit while running), primary button, start dialog (pre-fill, + New tag, countdown), summary dialog; persistent timer bar | WS8 | T2.3..T2.5, T1.11 | TIM-01..TIM-04, TIM-09, TAG-02, R-06, R-07, R-48, US-5.1..US-5.3 | Start time = press and end time = press in every path; the countdown cancels on any interaction. US-5.1 (e) is completed later: the goal progress in T4.7, the credit balance in T5.5 |
| T2.7 | Desktop history: grouped by day, jump to a date, edit, delete with confirmation, add session, inline overlap messages, midnight rows | WS8 | T2.2, T2.4, T2.6 | LOG-01, LOG-02, LOG-03..LOG-05, LOG-07 | 5 years of data scrolls smoothly; edits validate inline |
| T2.8 | Android main screen, session dialogs and history (parity with T2.6, T2.7) | WS10 | T1.12, T2.5 | MOB-01, TIM-01..TIM-04, TIM-09, LOG-01, LOG-02, LOG-03..LOG-05, LOG-07 | Same demo as T2.6 and T2.7 on a device |
| T2.9 | Quality: timer and history E2E on desktop (start → dialog → pause → summary → edit), midnight and DST cases | WS12 | T2.7 | US-5.1..US-5.5 | Every AC of US-5.1..US-5.5 has a passing test, except US-5.1 (e), which T4.7 and T5.5 test |

### 12.5 M3 - Real-time sync & offline (PRD phase 3)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T3.1 | Realtime channel: auth at connect, one room per user, message validation, close on revocation, events with revision; fan-out works with more than one server instance | WS5 | T2.1 | SYNC-01, R-35, US-9.1 | Malformed messages cannot crash the process; p95 propagation < 1.5 s |
| T3.2 | Change feed since revision (including tombstones) and the state snapshot | WS5 | T2.2, T2.3 | SYNC-02, SYNC-03, SYNC-07 | A client offline for 30 days converges with one snapshot plus one feed call |
| T3.3 | Core: durable per-user outbox for every write; ordered replay with backoff; optimistic projection; rejections become sync issues; latest action wins per field | WS6 | T2.5 | SYNC-02, SYNC-04, R-34, R-36, R-49, US-9.2 | Killing the app at any point loses nothing; no duplicates after lost responses |
| T3.4 | Core: per-user local cache; offline cold start; snapshot + feed on (re)connect, then live events; reconnect with backoff | WS6 | T3.1, T3.2 | SYNC-01, SYNC-03, SYNC-07, AUTH-03 | Airplane-mode cold start shows correct data and accepts commands |
| T3.5 | Session-expired flow: keep the outbox, ask the user to sign in again, resume replay | WS6/WS8 | T3.3 | AUTH-04 | Expiring credentials mid-offline loses nothing |
| T3.6 | Both apps: "Offline – will sync" indicator, sync-issues panel, dialogs close on remote changes, loading / empty / error states on every screen | WS8/WS10 | T3.3, T3.4 | SYNC-04, SYNC-06, R-48, US-9.1, US-9.2 | No screen shows blank content while loading or on failure; a pause on the PC closes the phone's dialog |
| T3.7 | Android foreground service hosting the core and the realtime connection; persistent notification while a session runs (title, tag colour, both timers, Pause/Resume); battery-optimisation guidance | WS10 | T3.4, T2.8 | MOB-02, US-12.6 | Timer visible and controllable with the app closed; a start on the PC appears on the phone within the propagation budget |
| T3.8 | Quality: two-client simulator with skewed clocks, random disconnects and offline replay; realtime fuzzing and authorisation pass | WS12 | T3.3, T3.4 | US-9.1..US-9.3, §9.1 | All clients converge to the server state in every generated scenario; no findings above low severity |

### 12.6 M4 - Tags, goals & stats (PRD phase 4)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T4.1 | Tag management: rename, recategorize, archive / unarchive, delete with replacement, link a distraction class, usage counts | WS3 | T2.3, T3.2 | TAG-01, TAG-03, TAG-05, TAG-06, TAG-08, R-29, R-30, R-50, R-52, US-6.2..US-6.5 | Recategorizing changes every past number; deleting with a replacement leaves no session pointing at the old tag |
| T4.2 | Account preferences: timezone (with device-difference prompt), week start, count weekends, time format, theme | WS1 | T1.1 | SET-01, SET-02, SET-03, GOAL-03, R-12, R-13, R-15, R-21 | Changing the week start changes "this week" everywhere consistently |
| T4.3 | Goals: effective-dated productive-hours goals with unset and remembered values | WS4 | T1.1 | GOAL-01, GOAL-02, R-19, R-20, US-10.1 | A goal change today does not alter last week's results |
| T4.4 | Per-day aggregates (rebuildable, same transaction) and stats queries: day timeline, per-day stacked series, headline numbers, breakdowns by category and tag, goal progress, streaks, goal-day heatmap; session list filters and search | WS4 | T4.1..T4.3, T0.5 | INS-01, INS-02, INS-05, INS-06, INS-08, INS-09, GOAL-04, GOAL-07, LOG-06, R-21..R-23, R-28, R-51, R-54, US-11.1..US-11.3, US-11.5 | Shared fixtures cover streaks with weekends on and off, recategorization and edits; any month loads within budget; dropping the aggregates and rebuilding gives identical results |
| T4.5 | Achievements: detect goal reached on every productive-time change; schedule the live crossing for the running session; persist once per period | WS4 | T4.3, T4.4 | GOAL-05, R-27 | Crossing while running fires once at the right second; reconnecting devices receive it |
| T4.6 | CSV export of the selected period (sessions file, daily summary file) | WS4 | T4.4 | LOG-08, US-11.6 | Columns match the PRD exactly; totals match the stats page |
| T4.7 | Desktop: tag management, goals and time settings, stats page (uPlot, with data tables), goal progress and streak on the main screen, CSV export, appearance setting | WS8 | T4.1..T4.6 | TAG-01, TAG-03..TAG-06, TAG-08, GOAL-01, GOAL-04, GOAL-07, INS-01, INS-02, INS-05, INS-06, INS-08, INS-09, LOG-06, SET-01..SET-03 | Matches the server fixtures; every confirmation states its effect on history; the main screen shows today's productive time vs the daily goal (US-5.1 e) |
| T4.8 | Android parity for T4.7 (Vico charts) | WS10 | T4.7 | MOB-01 | Same checks as T4.7 on a device |

### 12.7 M5 - Credits & notifications (PRD phase 5)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T5.1 | Server credits from sessions: rates effective from an instant, earning and leisure spending, ledger and balance (derived, rebuildable), recalculation on edits, recategorization and rate changes; `credits.changed` | WS13 | T4.4 | CRED-01, CRED-02, CRED-04, CRED-05, R-42..R-44, R-54, D-15, D-17, US-7.1..US-7.6 | Shared credit fixtures pass: rate change mid-session, recategorization, deletion, midnight crossing, negative balances |
| T5.2 | Core: the same credit math (shared fixtures), live balance, local credit notifications for Leisure sessions | WS13/WS6 | T5.1, T3.3 | CRED-02, CRED-03, R-45, R-46 | Fake-clock tests: each notification fires once per crossing, offline included |
| T5.3 | Notifications: native toasts on desktop (click to focus), Android local notifications; per-type toggles (synced); goal reached on every device once | WS9/WS10 | T4.5, T5.2 | NOTIF-01, NOTIF-03, GOAL-05, US-10.3 | Each type can be turned off; a goal notifies once per period per device, including after restart |
| T5.4 | FCM push: device token registration, server sends goal-reached pushes when FCM is configured; graceful when it is not | WS10/WS1 | T5.3 | NOTIF-04, D-23 | A goal reached on the PC notifies a phone whose app is closed; without FCM nothing breaks |
| T5.5 | Both apps: balance on the main screen, timer bar, Android notification (whole credits, equivalent time, negative in red), credit settings, ledger and balance line on the stats page, notification settings | WS8/WS10 | T5.1..T5.3 | CRED-02, CRED-04, CRED-05, CRED-08, NOTIF-03 | The main screen shows the live balance (US-5.1 e); a rate change shows from the moment it is saved; past ledger entries keep their rate |

### 12.8 M6 - Activity tracking (PRD phase 6)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T6.1 | Contract, schema and server for usage increments: idempotent, per-device/day/class totals with overlapped session; credits include tracked usage with the overlap rules; tracked minutes in stats | WS13 | T5.1 | ACT-08, R-41..R-43, US-8.5, US-7.3 | Credit fixtures cover usage overlapping Productive, Leisure and no sessions, and deleted or shortened sessions; resent increments create no duplicates |
| T6.2 | Core: sample store (7 days), presence handling, classification pipeline, increments through the outbox (split at midnight and session boundaries), live balance and notifications from usage | WS13/WS6 | T6.1, T5.2 | R-37..R-41, R-45, R-46, ACT-08 | Fake-clock tests: increments are correct across midnight and session boundaries; nothing but totals leaves the core |
| T6.3 | Default usage rules (one data file shared by both apps) and how it is updated | WS13 | T6.2 | ACT-07, US-8.1, US-8.2 | The PRD's default domains and social apps are classified out of the box; LinkedIn is not |
| T6.4 | Windows tracker: foreground check every 5 s (executable and title), UI Automation address bar for Chrome, Edge, Firefox and Brave, lock and sleep handling, running in the tray | WS13/WS9 | T6.2 | ACT-01, ACT-02, US-8.1 | Switching apps and tabs produces correct totals; no measurable CPU at rest |
| T6.5 | Android tracker in the foreground service: usage events, CATEGORY_GAME, social packages, screen-off handling, usage-access explanation screen | WS13/WS10 | T6.2, T3.7 | ACT-04, US-8.2 | Totals match actual usage; no wake-ups with the screen off |
| T6.6 | Android accessibility service for browser domains (opt-in) with guided setup including "Allow restricted settings" | WS13/WS10 | T6.5 | ACT-05 | Works in Chrome after the guided setup on Android 13+ |
| T6.7 | Both apps: tracking settings (on / paused / off, indicator), usage rules with toggles, recently seen apps with one-tap classification, YouTube "Shorts only"; Android permissions onboarding and status | WS8/WS10 | T6.3..T6.5 | ACT-06, ACT-07, ACT-10, MOB-06, US-8.4, US-8.6, US-12.8 | Classifying a recently seen app changes how its next minute is counted |
| T6.8 | Quality: simulator with sessions and usage across two devices; privacy test (no app names, URLs or titles in any request); CPU and battery measurement | WS12 | T6.4, T6.5 | Principle 11, §9.3, US-8.5 | Budgets met; privacy test green |

### 12.9 M7 - Platform features & release (PRD phase 7)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T7.1 | Smart game detection on Windows: library folders, launcher parentage, full-screen with sustained GPU; suggestion notification with Yes / No / Neutral that becomes a rule | WS13/WS9 | T6.4, T5.3 | ACT-03, R-40, US-8.3 | Until answered, time counts as Gaming only with a library-folder signal; an answer creates the rule |
| T7.2 | Tray complete (running / paused icon, menu with Start/Resume, Pause, timers, Open, Quit); launch at startup (default on, hidden) | WS9 | T1.10, T3.4 | DESK-01, DESK-03, US-12.2, US-12.3 | Start and pause from the tray with the window closed; startup shows only the tray |
| T7.3 | Global shortcut (default Ctrl+Alt+Space, configurable) that toggles start/pause and opens the dialog | WS9 | T2.6 | DESK-04, US-12.4 | Works while another app is focused |
| T7.4 | Mini floating window (always on top, both timers, start/pause) | WS9/WS8 | T2.6 | DESK-05, US-12.5 | Stays on top; updates live; memory stays within budget |
| T7.5 | Android home-screen widget (day total, session timer, balance, start/pause) | WS10 | T3.7, T5.5 | MOB-03, US-12.7 | Updates on every state change, including changes from the PC |
| T7.6 | Desktop packaging, code signing when a certificate is available, signed auto-update from the server or GitHub releases; About with update status and log export | WS11 | T1.10 | DESK-06, SET-05 | Update from version N to N+1 without reinstalling |
| T7.7 | Android release signing, version endpoint and in-app updater (download, verify, install) | WS11 | T1.12 | MOB-05 | The app updates itself from N to N+1 |
| T7.8 | End-to-end suites: desktop (WebdriverIO + `tauri-driver`) and Android (Maestro), including offline and cross-device flows | WS12 | T7.2..T7.5 | §12.10 | Green in CI |
| T7.9 | Release gate: accessibility audit, performance and size budgets, README complete (deploy, update, backup and restore tested, building the installer and the APK), release notes | WS12/WS11 | all M7 | X-01, X-03, OPS-02 | Checklist signed off; v1 published |
| T7.10 | Legacy data migration tool (D-08) | WS1 | T2.2, T4.1, T4.3 | OPS-05 | A legacy export imports with matching totals |

### 12.10 Backlog (P2)

AUTH-09 registration lock · TIM-05 switch · TIM-06 discard · TIM-07 adjust start · TIM-13 Pomodoro · LOG-09 bulk edit · LOG-10 split / merge · GOAL-06 per-weekday targets · INS-03 weekly trend · INS-04 year view · INS-07 previous-period comparison · INS-10 extra tiles and tag filter · MOB-04 iOS · DESK-09 macOS / Linux · SET-06 languages · OPS-04 metrics · CRED-07 manual credit adjustment · ACT-09 browser extension · X-02 command palette · web client · calendar integration · deep links.

### 12.11 Testing strategy (owned by WS12, written by every workstream)

| Level | What |
|---|---|
| Unit | Time math across the timezone matrix and DST days; per-day history rows; goal and streak math (weekends on and off); credit math including overlap and rate changes; increment splitting; formatters; tag-name normalisation |
| Shared fixtures | One suite (D-19) that the TypeScript server and the Rust core both pass in CI: time, streaks, credits |
| Property | Timer command reducer (any order and timing gives at most one running session and no overlaps); outbox replay is idempotent |
| Simulation | Multiple clients with skewed clocks, disconnects and offline periods converge (T3.8, T6.8) |
| Contract | Server and client conform to the shared contract; generated mocks match the real server |
| Integration | Each operation against a real database, including authorisation checks; auth flows with email and Google; timer events; sync conflict resolution |
| Acceptance | Every AC of every user story a task cites has a test (US-x.y in the test name) |
| E2E | Per platform: sign up → verify → start → dialog → pause → summary → edit → stats → goal notification; offline round trip; tray, notification and widget flows |
| Non-functional | Security passes (T1.13, T3.8), accessibility audit, performance budgets (section 9.3), privacy test (T6.8), visual regression in light and dark |

---

## 13. Decisions (resolve open ones in T0.1, then update the affected rules)

| ID | Question | Recommendation / decision | Affects |
|---|---|---|---|
| D-01 | Tech stack per layer | **Decided 2026-10-24** (section 11), PostgreSQL included | Everything |
| D-02 | Main screen: which timer is larger, the current session or the day total? | **Decided 2026-10-26 (owner, recommendation):** the day total is the larger timer, the current session timer is smaller beside it; recorded as FE-013 | TIM-04 |
| D-03 | Sessions across midnight: two records, or one record shown split? | **Decided 2026-10-24 (owner):** one record, attributed per day and shown as one row per day (R-11) | R-11, LOG-07 |
| D-04 | Streak definition | **Decided 2026-10-24 (PRD US-10.2):** consecutive days meeting the daily goal; requires a daily goal; weekends optional; unfinished today never breaks it (R-22, R-23) | GOAL-07, INS-06 |
| D-05 | Default working days | **Decided 2026-10-24 (PRD US-10.2):** replaced by "Count weekends" (default on) for streaks only (R-21) | R-21, GOAL-03 |
| D-06 | Forgotten-timer thresholds | **Decided 2026-10-24 (PRD):** not applicable; no auto-stop or reminders (R-53) | R-33 |
| D-07 | Away prompt default when ignored | **Decided 2026-10-24 (PRD):** not applicable; no idle detection (R-53) | R-32 |
| D-08 | Migrate data from the legacy deployment? | **Decided 2026-10-24 (owner, recommendation):** yes; import users, sessions, tags and goals from the legacy deployment (T7.10) | OPS-05, T7.10 |
| D-09 | Platforms for v1 | **Decided:** Windows + Android (sideloaded APK, not Google Play); others P2 | DESK-09, MOB-04, MOB-05 |
| D-10 | iOS in scope? | **Decided 2026-10-24 (PRD out of scope):** not in v1. iOS's Screen Time API never tells an app which app is in use, so activity tracking (ACT-*) cannot exist on iOS | MOB-04 |
| D-11 | Hosting model | **Decided 2026-10-24 (PRD):** the owner self-hosts one server and shares it with friends; open sign-up with email verification; registration lock is P2 | AUTH-09, rate limits |
| D-12 | Notify goals reached for past periods via edits or manual entries? | **Decided 2026-10-24 (owner, recommendation):** no; only current periods notify | R-27 |
| D-13 | Refresh-credential lifetime | **Decided 2026-10-24 (owner, recommendation):** 30 days, rotating, extended with use, so a desktop left offline for a week stays signed in | AUTH-03 |
| D-14 | Minimum session duration / accidental clicks | **Decided 2026-10-24 (owner, recommendation):** 1 s minimum; an accidental session is deleted from history rather than auto-deleted | R-04 |
| D-15 | Default credit rates | **Decided 2026-10-24 (owner, PRD §7):** earn +5 per productive hour; Gaming −10, Social Media −20, other leisure −10 per hour; all configurable per user | R-42, R-43, CRED-05 |
| D-16 | Daily free leisure allowance | **Decided 2026-10-24 (PRD):** none; the balance carries over instead | R-44 |
| D-17 | Does unused credit carry over? | **Decided 2026-10-24 (PRD US-7.5):** always; no cap; never resets | R-44 |
| D-18 | Which usage counts as leisure? | **Decided 2026-10-24 (PRD):** two distraction classes, Gaming and Social Media; YouTube is in the default Social Media rules with an optional "Shorts only" setting; LinkedIn is not in the defaults | R-40, ACT-07 |
| D-19 | Time and credit math run on the server (TypeScript) and in the client core (Rust). How do they keep one definition (principle 3)? | **Decided 2026-10-24:** one shared fixture suite (`packages/contract/fixtures/`: time zones, DST days, sessions across midnight, streaks, credit cases) that both implementations must pass in CI; revisit compiling `pulse-core` as a Node addon if they drift | R-10..R-18, R-21..R-23, R-42..R-46, T0.5 |
| D-20 | Server data access library | **Decided 2026-10-24:** Kysely: typed SQL with raw migrations, which the exclusion constraint for R-05 needs | Section 11, T1.1 |
| D-21 | Tracked Gaming / Social usage during a Productive session | **Decided 2026-10-24 (owner):** the overlapping time earns nothing and is charged at the class rate | R-42, R-43 |
| D-22 | How the Windows app detects browser sites | **Decided 2026-10-24 (owner):** window title plus the address bar through UI Automation (Chrome, Edge, Firefox, Brave); the browser extension moves to P2 (ACT-09) | R-38, ACT-02 |
| D-23 | Android push | **Decided 2026-10-24 (PRD US-10.3):** FCM, optional: a self-hoster without FCM credentials, or a phone without Google Play services, still gets every notification raised on the device itself | NOTIF-04 |
| D-24 | What do the game-suggestion answers become? (US-8.3 offers Yes / No / Neutral, but rules have only Gaming / Social Media / Ignore) | **Decided 2026-10-24 (owner, recommendation):** Yes → a Gaming rule; No and Neutral → an Ignore rule (not tracked, never suggested again) | R-40, ACT-03, T7.1 |
| D-25 | Session-dialog edge cases the PRD leaves open: what Close does; text typed before a change on another device; pre-fill when the last tag is archived | **Decided 2026-10-24 (owner, recommendation):** Close keeps the values from when the dialog opened; typed text is saved to the session; an archived tag is not pre-filled (the title still is). Recorded as FE-010..FE-012 in `docs/FE_GUIDE.md` | R-07, R-48 |
| D-26 | App identifiers and the oldest supported Android version (both fixed once released: changing them breaks updates and app data) | **Decided 2026-10-24 (owner, recommendation):** Android `applicationId` `com.naimur_rahman.pulse` (the legacy package; the new APK installs over the legacy app only if signed with the same key); Windows Tauri identifier `com.naimur-rahman.pulse` (Tauri allows only letters, digits, hyphens and periods); minSdk 26 (Android 8.0) | Section 11, T0.2 |
| D-27 | Android backup and device-to-device transfer of app data | **Decided 2026-10-26 (owner, recommendation):** off (`allowBackup="false"`, extraction rules exclude everything). The server is the source of truth; restoring a local cache, outbox or credentials onto another device is unsafe, and a fresh sign-in restores everything | T0.2, MOB-01 |
| D-28 | Which CI service, and how strictly is CI required on `main`? | **Decided 2026-10-25 (owner, recommendation):** GitHub Actions (the repository is on GitHub); a repository ruleset on `main` requires a pull request with the `ci` check green and forbids force-push and deletion; the repository admin (the owner) may bypass it, so local commits made through the `auto-commit` gate can still be pushed straight to `main`, where CI runs again (the bypass covers every rule, force-push included, so the guard hooks remain the protection against it). Branches need not be up to date before merging: the pull request run already tests the merge result and the push to `main` runs CI again | T0.3 |
| D-29 | How much of section 7 does T0.4 define before the features exist? | **Decided 2026-10-25 (owner, recommendation):** T0.4 builds the whole toolchain, the conventions, the error model, all section 7.3 events, the section 6 entity schemas and full request and response schemas for Auth, Timer, Sessions, Tags, Goals, Preferences, Push, Sync, App updates and Health. Stats, Credits, Usage, Achievements and Data operations are named in the contract without shapes; the feature task that implements each one defines its shapes then (as T6.1 does for usage increments) | T0.4, section 7 |
| D-30 | Do credential operations carry a command ID (R-34)? | **Decided 2026-10-25 (owner, recommendation):** no. Command IDs go on data writes and on completing first sign-in; register, login, Google sign-in, refresh, logout, password and email changes, resets, device revocation and account deletion are online-only and are not replayed, so the idempotency store never holds raw tokens (only hashes are stored, section 6) | R-34, section 7.1, T0.4 |
| D-31 | Re-authentication and unverified sign-in | **Decided 2026-10-25 (owner, recommendation):** changing the email and deleting the account require the password or a fresh Google sign-in; changing the password requires the current one, so a Google-only account cannot set a password that way. Signing in with the right password but an unverified email answers `FORBIDDEN` (the app offers to resend the link), distinct from the uniform `UNAUTHENTICATED` for wrong credentials; it reveals only that the password was right | AUTH-06, AUTH-08, AUTH-10, T0.4 |
| D-32 | Preference values | **Decided 2026-10-25 (owner, recommendation):** week start is any of the seven days (default Monday); time format is system, 12-hour or 24-hour; the timezone is empty until the user confirms it at first sign-in (R-15); one toggle per NOTIF-03 type (six, weekly and monthly goal sharing one); onboarding completion is the instant it happened | R-13, R-15, SET-03, NOTIF-03, T0.4 |
| D-33 | Delivery process: how much review per task | **Decided 2026-10-25 (owner):** three lanes picked by risk. Fast (plumbing, config, docs, copy-a-pattern work): verify and commit. Standard (default; most features): build, verify, the builder checks the ACs, change-review on the Spec axis only. Critical (sync, outbox, auth, time math, credits, activity data, migrations): the full pipeline with `qa-engineer`. Fix rounds capped at 2 (Fast, Standard); only Critical and High findings block; the rest go to `docs/tasks/BACKLOG.md`. Applies from T0.7; skill text in `.claude/skills/deliver-task` and `auto-commit`. Reason: M0's six tasks ran the full loop (up to three QA rounds) on plumbing. |

Decided 2026-10-24 alongside the stack, and confirmed by the PRD: activity tracking is **track-and-notify only** (no blocking); credit is earned only from timer sessions (Productive ones, R-42); a user uses one device at a time, and everything syncs live.

---

## Appendix A. Defaults & limits

| Item | Value |
|---|---|
| Goals | Unset by default; minute precision (R-19) |
| Week start / count weekends | Monday / on |
| Title / summary / tag name | ≤ 200 / ≤ 2000 / 1-40 characters |
| Password | 8-128 characters |
| Other field limits (D-30..D-32, T0.4) | Email ≤ 254 · email and refresh tokens ≤ 512 · push token ≤ 4096 · device name 1-100 · app version 1-32 · search text ≤ 200 characters · goal 1-44 640 minutes (31 days) |
| Access / refresh credential lifetime | 15 min / 30 days rotating (D-13) |
| Verification link / reset link / resend limit | 24 h / 1 h, single use / once a minute |
| Idempotency retention | ≥ 30 days |
| Session dialog countdown | 5 s (R-48) |
| Future-time tolerance | 60 s |
| Clock tick | 1 Hz, aligned to second boundaries |
| History page size | 50 |
| Cross-device propagation target | p95 < 1.5 s (about 1 s) |
| Toast duration (goal reached) | 6 s |
| Brand colour | `#7C3AED` |
| Category colours | Productive green · Leisure orange · Neutral blue (exact values in the design tokens) |
| Credit rates (per hour) | Earn +5 · Gaming −10 · Social Media −20 · other leisure −10 (D-15) |
| Credit storage / display | 2 decimals / whole credits, rounded down |
| Low-credit threshold / below-zero reminder | 10 min of the current class left / every 15 min of further spending |
| Foreground check interval | ≤ 5 s (Android: screen on only) |
| Usage increment interval | ≤ 60 s |
| Foreground sample retention / recently seen apps | 7 days / last 7 days |
| Global shortcut | Ctrl+Alt+Space |
| Launch at startup | On, hidden |
| Size budgets | Installer < 15 MB · APK < 15 MB · tray memory < 50 MB (section 9.3) |
| Server configuration (`.env`) | `PORT` (default 3000) · `DATABASE_URL` (empty = bundled database) · `DB_PASSWORD` (bundled database) · `JWT_SECRET` · `REFRESH_SECRET` · `PUBLIC_API_URL` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `SMTP_USER` · `SMTP_APP_PASSWORD` · `SMTP_HOST` / `SMTP_PORT` (default Gmail) · `MAIL_FROM` · `FCM_PROJECT_ID` · `FCM_CLIENT_EMAIL` · `FCM_PRIVATE_KEY` (all optional, D-23) · `DOMAIN` (optional) · `CORS_ORIGINS` (comma-separated, empty = none) · `TRUST_PROXY` (number of trusted reverse proxies, default 0). Template: `infra/.env.example` |

## Appendix B. Copy deck

| Event | Title | Message |
|---|---|---|
| Daily goal | Daily goal reached! | You've logged {duration} of productive time today. Great work! |
| Weekly goal | Weekly goal reached! | You've logged {duration} of productive time this week. Keep it up! |
| Monthly goal | Monthly goal reached! | You've logged {duration} of productive time this month. Amazing progress! |
| Start dialog | What are you working on? | Title · Tag · + New tag · Confirm · "Saving in {n}s" |
| Summary dialog | Session saved · {duration} | What did you accomplish? · Save · "Saving in {n}s" |
| Title placeholder | | What are you working on? |
| Summary placeholder | | What did you accomplish? |
| Streak | | {n} day / {n} days |
| Credit low | Credits running low | About {duration} of {class} left. |
| Credit zero | Out of credits | You've used all your credits. |
| Below zero | Still below zero | You're at {credits} credits. |
| Game suggestion | Is {app} a game? | Yes · No · Neutral |
| Offline indicator | | Offline – will sync |
| Verify email | Confirm your email | Open this link within 24 hours to finish signing up. |
| Reset password | Reset your password | This link works once, within 1 hour. |
| Account deleted | Your Pulse account was deleted | All your data has been permanently removed. |

## Appendix C. Legacy carry-over actions

- **Rotate credentials:** the legacy API's local environment file (never committed) contained live-looking hosted-database credentials. Rotate them if that folder was ever shared.
- **Existing users:** legacy clients (v0.0.5, Windows and Android, git tags `win-v0.0.5` and `android-v0.0.5`) point at the legacy hosted API. Plan the switch: migrate data (D-08), then publish new clients pointing at the new server; the legacy API can be retired afterwards.
- **Brand assets:** the legacy brand-asset generator needed a source logo folder that was not in the repository. Commit the source logo (preferably vector) with the rebuild.
