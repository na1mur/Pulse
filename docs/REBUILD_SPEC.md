# Pulse - Rebuild Specification (v2)

> Status: **draft for revision**. Tech stack: **decided 2026-10-24** (see section 11; the database is still a proposal).
> This version replaces the legacy code-analysis spec. It describes *what* to build, the rules it must follow and how the work is split, without referring to any file, function or framework from the old code. The previous version (full legacy analysis with code citations) is preserved in git history at commit `aad9c2f`.

## How to use this document

| Section | Read it for |
|---|---|
| 1. Product summary | What Pulse is and is not |
| 2. Principles | The rules every design decision is checked against |
| 3. Domain rules | The single, canonical definition of every time/goal/stat concept (R-xx) |
| 4. Logical mismatches | What was inconsistent in the legacy app and the legacy spec, and how this spec resolves it |
| 5. Feature list | Every feature with an ID, priority and origin - **the list to revise** |
| 6. Domain model | Entities and invariants (storage-agnostic) |
| 7. Operations & events | The client/server contract at capability level (no routes, no wire format) |
| 8. Sync, realtime & offline | How devices stay consistent and nothing is lost |
| 9. Non-functional requirements | Security, reliability, performance, accessibility, observability |
| 10. UX & design | Information architecture, screens, flows, design-system rules |
| 11. Tech stack | Requirements the stack must satisfy; decision record |
| 12. Task distribution | Workstreams, milestones, tasks with dependencies and "done when" |
| 13. Open decisions | Questions to settle before / while building |
| Appendices | Defaults & limits, copy deck, legacy carry-over actions |

Priorities: **P0** = MVP (first usable release), **P1** = v1.0, **P2** = later / nice to have.
Origin: **Kept** (legacy behaviour, unchanged), **Changed** (legacy behaviour, redefined), **New**.

---

## 1. Product summary

**Pulse is a personal work-time tracker built around one timer per user, synced live across that user's devices.**

- One action starts tracking; one action stops it. Each start-to-stop run is a **session** (start, end, optional title, tag and note).
- The main display answers "how much have I worked today?" and "how long is the current session?".
- Users set daily, weekly and monthly goals, see progress and get a celebration when a goal is reached.
- Users label sessions with their own **tags** and can filter every statistic by tag.
- History is editable: fix, delete or add sessions after the fact.
- Works offline; everything done offline syncs later without loss or duplication.
- Self-hostable backend; clients can be pointed at any server.
- **Activity tracking and leisure credit** (opt-in): the desktop and Android apps detect which app or website is in the foreground, classify games and social media as *leisure*, and spend **leisure credit** earned from timer sessions, minute by minute. Pulse only tracks and notifies when the credit runs out; it never blocks anything.

Single user per account, who uses one device at a time (PC or phone); every change syncs live between them.

Target platforms: **Windows desktop** and **Android** (distributed as a **sideloaded APK**, not through Google Play). Others are P2 (D-09).

Non-goals: teams/shared workspaces, billing or invoicing, project management, per-second server sync, time-tracking for other people, parental control, blocking apps or websites.

Legacy at a glance (context only): the old app (v0.0.5) had a client-run timer, sessions created by the client on pause, a server that relayed and stored an opaque timer snapshot, no session editing, and many inconsistencies in time definitions. Section 4 lists them.

---

## 2. Principles

1. **Never lose tracked time.** No user action, crash, quit, restart, network failure or conflict may silently drop or corrupt time.
2. **The server owns the timer and the clock.** Clients show the server's state locally and correct for clock skew; they never invent the truth.
3. **One definition per concept, implemented once.** Day, week, month, streak, goal-met and every other concept has exactly one definition (section 3), shared by every screen and every computation.
4. **Offline is normal.** Every write is a command with a client-generated ID, queued durably and replayed safely (idempotent).
5. **Starting is instant; the timer is always visible.** No blocking dialog before or after tracking. The timer is visible on every screen and in the OS shell.
6. **Nothing fails silently.** Every failure is visible: sync status, rejected changes, errors, loading and empty states.
7. **Derived data is rebuildable.** Statistics are computed from sessions. Any cache can be thrown away and recomputed.
8. **Small surface, low traffic.** No per-second network or database writes; a handful of requests per session.
9. **Simple to self-host.** One server process plus one database, configured by validated settings.
10. **Small and fast.** Pulse is a basic app that runs all day: small installers, low memory when minimised, instant start, event-driven work instead of polling. Size and speed budgets (section 9.3) are release gates.
11. **Minimal activity data.** Only the app identifier or the website's domain ever leaves the device: never full URLs, page content or window titles.

---

## 3. Domain rules (canonical definitions)

Every rule has an ID so features, tasks and tests can reference it. Where a rule is a recommendation awaiting a decision, it links to section 13.

### 3.1 Timer and sessions

| ID | Rule |
|---|---|
| R-01 | A user has **at most one running session** at any time. The timer has two states: **Idle** and **Running**. There is no separate "paused" state: *pause = stop* (ends the session), *resume = start* (a new session). |
| R-02 | **Start while running** is a no-op that returns the running session. **Stop while idle** is a no-op. **Switch** = stop the current session and start a new one atomically, at the same instant. |
| R-03 | **Timestamps come from the server** for online commands (time of receipt). For commands replayed from the offline queue, the client's occurred-at time (corrected by the last known clock offset) is used. It is clamped to be no later than server time and no earlier than the end of the user's previous session. |
| R-04 | A session must have `end > start` and a duration of at least 1 second. End times in the future are rejected (60 s tolerance for clock skew). |
| R-05 | A user's sessions **must not overlap**, including the running session. Edits and manual entries that would overlap are rejected with a conflict error that identifies the overlapping session. |
| R-06 | The **note** (summary) is optional and added *after* stopping, in a prompt that does not block anything. Stopping never waits for user input. The end time is always the stop instant. |
| R-07 | **Carry-over:** after a stop, the timer input clears title and tag. A one-tap **Continue** action starts a new session with the previous title and tag. A plain Start uses only what the user typed or selected. |
| R-08 | **Discard** cancels the running session and records nothing; the UI offers undo. **Delete** removes a stored session (soft delete, undo window, tombstone for sync). |
| R-09 | A session records the **timezone in effect when it was created** (manual entries use the user's current timezone). |

### 3.2 Days and periods

| ID | Rule |
|---|---|
| R-10 | A **day** is a calendar date in a timezone, identified as `YYYY-MM-DD`. All day math uses one well-tested timezone library with the IANA database. Never use device-locale date strings. |
| R-11 | **Day attribution:** a session's seconds count toward the local days it covers, *clipped at local midnight* in the session's own timezone (R-09). A session that crosses midnight stays **one session**; no rollover or split happens. See D-03. |
| R-12 | **"Today", "this week", etc.** are evaluated in the user's **current timezone setting**, not the device's timezone. A period is a set of day keys; its total is the sum of the seconds attributed to those keys. |
| R-13 | **Week** = 7 consecutive days starting on the user's *week start* setting (default Monday). **Month** = calendar month. **Year** = calendar year. Rolling windows exist only when labelled explicitly ("Last 7 days", "Last 30 days"). |
| R-14 | **Period IDs:** day `2026-10-24`, week = date of its first day `W2026-10-19`, month `2026-10`, year `2026`. |
| R-15 | The **timezone setting changes only by explicit user action**. When the device timezone differs, the client offers to switch; it never changes the setting silently. |

### 3.3 Durations and totals

| ID | Rule |
|---|---|
| R-16 | Store instants, not accumulated numbers. Compute durations in **integer seconds**. Never accumulate floating-point minutes. |
| R-17 | **Worked time** of a day or period = attributed seconds of closed sessions + attributed seconds of the running session up to *now*. It is always live: every surface that shows "today" ticks while running. |
| R-18 | **Display:** clocks show `H:MM:SS` (hours unbounded). Summaries show `Xh Ym`, **rounded down** to the whole minute, so a goal is never shown as reached before it is. Displayed elapsed time is never negative (clamp at 0). |

### 3.4 Goals, streaks and achievements

| ID | Rule |
|---|---|
| R-19 | Three goal kinds: **daily, weekly, monthly**. Each is either a duration in minutes or **disabled**. Disabling keeps the last value, so re-enabling restores it (on every device). |
| R-20 | Goals are **effective-dated**. A change applies to the current period and later ones; past periods keep the goal that was in effect when they ended. |
| R-21 | **Working days** (default: see D-05). The daily goal applies only on working days. Work done on non-working days still counts toward every total. |
| R-22 | A day **qualifies** if it is a working day and, when its daily goal is enabled, worked ≥ goal; when the daily goal is disabled, worked ≥ 1 minute. |
| R-23 | **Current streak** = number of consecutive qualifying working days, counting back from today. Non-working days are skipped: they neither break nor extend a streak. *Today counts only if it already qualifies; an unfinished today never breaks the streak.* **Longest streak** uses the same rule. See D-04. |
| R-24 | **Goal achievement %** for a range = qualifying days ÷ eligible days. Eligible days are the working days in the range with the daily goal enabled, up to yesterday, plus today if it already qualifies. One decimal place. |
| R-25 | **Average per active day** = total ÷ number of days in the range with at least 1 minute of work. The label must say "per active day". |
| R-26 | **Best day** = the day with the highest total in the range; ties go to the most recent day. Always shown with its date. |
| R-27 | An **achievement** happens at the first moment a period's worked time reaches its enabled goal. It is recorded **once per (goal kind, period ID)**, celebrated on every device (including devices that were offline, when they reconnect), and never revoked by later edits. It fires **live** while the timer runs, not only at stop. Changes to past periods do not trigger celebrations (D-12). |
| R-28 | Progress bars cap at 100%; percentage text may exceed 100%. "Remaining" = max(0, goal − worked). |

### 3.5 Tags and filters

| ID | Rule |
|---|---|
| R-29 | Tag names are trimmed, internal whitespace collapses to single spaces, and length is 1-50 characters. Names are **unique per user** by a normalised key (Unicode NFKC + case-fold). The display name keeps the user's casing. Creating a tag whose key already exists returns the existing tag. |
| R-30 | Renaming keeps the tag's identity, so history shows the new name. Deleting a tag moves its sessions, and the running session, to **Untagged**, after a confirmation that shows the usage count. |
| R-31 | **Tag filter:** with a tag selected, every total, series and summary is limited to that tag. **Goals and goal-based metrics (progress, achievement %, streak) are hidden**, because goals are not per tag. The by-tag breakdown shows each tag's share of the *unfiltered* total. |

### 3.6 Time-integrity guards

| ID | Rule |
|---|---|
| R-32 | **Away detection** (desktop): if the device is idle, locked or asleep for at least the threshold while the timer runs, the user is asked on return: *Keep all*, *Discard away time* (the session ends at the moment they went idle), or *Discard away time and keep running* (the session ends at idle-start and a new one starts now). Ignoring the prompt keeps all time (non-destructive). |
| R-33 | **Forgotten timer:** at the reminder threshold the user is notified. At the maximum, the server stops the session at `start + max` and flags it "auto-stopped - review". Both thresholds are configurable and can be disabled (D-06). |

### 3.7 Consistency

| ID | Rule |
|---|---|
| R-34 | Every write carries a **client-generated ID** (idempotency key). The server keeps the result for at least 30 days, and a replay returns the original result. |
| R-35 | Each user has a **revision counter** that increases on every change. Events and change-feed entries carry the revision. Clients apply only newer revisions; a gap triggers a change-feed fetch. |
| R-36 | The server **never silently drops** a client change. A rejected queued change becomes a **sync issue** that the user can fix or discard. |

### 3.8 Activity tracking

| ID | Rule |
|---|---|
| R-37 | Activity tracking is **opt-in per device** and can be paused at any time. While it is active, the device shows it (tray icon state on desktop, the ongoing notification on Android). |
| R-38 | An **activity segment** is one continuous stretch of one foreground *subject* on one device: device, subject kind (`app` or `domain`), subject ID, optional platform category hint, start, end. Subject IDs: the executable file name on Windows (`eldenring.exe`), the package name on Android (`com.instagram.android`), the registrable domain for websites (`youtube.com`, never the full URL). Window titles are used only on the device, as a classification fallback, and are never sent (principle 11). |
| R-39 | Segments are recorded only while the device is **in use**: a segment ends when the device goes idle (the away threshold, R-32), locks, sleeps or turns its screen off. Segments shorter than 5 s are dropped; consecutive segments of the same subject less than 5 s apart are merged. Segments from one device never overlap. Segments from different devices may overlap and both count (one user rarely uses two devices at once). |
| R-40 | **Categories:** `game` and `social` are **leisure**; everything else is `neutral`. A subject's category is resolved in this order: the user's own rule, then the server catalog, then the platform hint (Android app category, a game-library install folder on desktop), otherwise `neutral` (D-18). |
| R-41 | The server resolves the category **when it receives a segment** and stores it on the segment. Changing a rule affects new segments only, unless the user explicitly applies it to past segments for a chosen range. |

### 3.9 Leisure credit

| ID | Rule |
|---|---|
| R-42 | Credit is **earned only from timer sessions**: worked time (R-17) × the **earn rate** (D-15), plus the optional daily free allowance (D-16). Detected productive apps earn nothing (for now). |
| R-43 | Credit is **spent** one second per second of leisure segment. The balance may go negative: Pulse tracks and notifies, it never blocks. |
| R-44 | **Balance** = credit earned − credit spent, computed in integer seconds from sessions, segments and credit settings, walking day by day and applying the carry-over rule (D-17). It is derived data (principle 7). Credit settings are **effective-dated** like goals (R-20): a change never rewrites past days. Display follows R-18 (`Xh Ym`, rounded down; negative balances shown as "over by"). |
| R-45 | The **live balance** on a device = the last balance from the server + this device's unsynced worked time × earn rate − its unsynced leisure time. It ticks while leisure is in the foreground. |
| R-46 | **Notifications** are raised by the device where the leisure is happening, from its live balance, so they work offline: a warning when the balance drops to the warning threshold, "out of credit" when it reaches 0, then a reminder at every reminder interval while leisure continues and the balance stays at or below 0. Each fires once per crossing. Thresholds are in Appendix A and configurable. |
| R-47 | **Leisure while the timer is running:** both count (the session still earns, the leisure still spends). After 5 continuous minutes of leisure during a running session, the device notifies "Timer still running while on {subject}". |

---

## 4. Logical mismatches found and how they are resolved

### 4.1 In the legacy product (behaviour)

| # | Mismatch | Effect | Resolution |
|---|---|---|---|
| L1 | "Week" meant the calendar week (Mon-Sun) on some screens and the rolling last 7 days on others; "month" meant the rolling 30 days on some and the calendar month on others | Different "this week" totals on different screens | R-13 |
| L2 | The weekly trend used rolling 7-day blocks labelled "Week 1..4", while the week chart used calendar weeks | Trend and week chart disagree | R-13, INS-03 |
| L3 | The device timezone drove the client's "today" while the user-setting timezone drove server stats; the client silently overwrote the setting with the device zone | Clock and stats disagree after travel; two devices in different zones fight | R-12, R-15 |
| L4 | The server attributed a whole session to its start day; only the client split sessions at midnight, so multiple devices could each post the split (duplicates); a multi-day gap credited only one day | Skewed and duplicated daily totals | R-11 |
| L5 | Session end time = when the summary dialog closed, not when pause was pressed | Saved sessions longer than the clock showed; clock then "jumped" to match | R-06 |
| L6 | The big clock showed today's total and the "Today" card showed the server value; the card did not tick while running | Two different "today" numbers on one screen | R-17 |
| L7 | "Reset" zeroed the live clock, but the next stats refresh re-seeded it from saved sessions; reset had no UI | Meaningless operation | Removed; replaced by Discard (R-08) |
| L8 | The title carried over to the next session silently, but the tag was replaced | Inconsistent, surprising reuse | R-07 |
| L9 | The start button said "Resume" on the first start of the day; the dialog button said "Pause" after the timer had already paused | Misleading labels | Start/Stop wording, no dialogs (R-06) |
| L10 | Streak = days with *any* work (the original plan said "days hitting the target"), and it dropped to 0 every morning until you worked | Streak meaningless and flickering | R-22, R-23 |
| L11 | Goal achievement % counted only days that had work; days with no work were not counted as missed | Inflated percentage | R-24 |
| L12 | Default goals 8 h/day applied to all 7 days, while weekly 40 h and monthly 160 h assume 5-day weeks | Daily goal "missed" every weekend; streak broken by weekends | R-21, D-05 |
| L13 | The daily achievement used the *current* goal while the stats used a per-day snapshot | "Goal met" differed between toast and stats after a goal change | R-20 |
| L14 | The weekly achievement's period ID was a day, not a week; deduplication was in memory only | Weekly celebration could repeat; restarts re-celebrated | R-14, R-27 |
| L15 | Achievements fired only when a session was saved (after pause and dialog), never live | Celebration delayed until stop | R-27 |
| L16 | With a tag filter, tag minutes were compared against the full daily goal | Meaningless percentages | R-31 |
| L17 | "Average/Day" divided by days with data (all time), unlabelled | Misleading metric | R-25 |
| L18 | Best day ties were unordered; one screen showed the best day without its date | Unstable / incomplete | R-26 |
| L19 | Goal "off" was stored as 0; the remembered value lived only in one device's local storage and was rounded to whole hours (a 90-minute goal displayed as 2 h, under 30 min fell back to defaults) | Lost precision; re-enabling differed per device | R-19 |
| L20 | Time while the app was closed or the machine slept counted as work; on an offline restart the time stayed on the clock but was never saved | Inflated or lost time | R-32, R-33, server-owned timer |
| L21 | Stats were stored as running sums that could not be recomputed, while sessions could not be edited | No way to fix a mistake | Principle 7, LOG-03..05 |
| L22 | Marketed as "offline-first", but opening the app offline with an expired access token showed the login screen | Unusable offline | AUTH-03, SYNC-03 |
| L23 | A 12-month chart was advertised but not built | Promise not kept | INS-04 |
| L24 | Day rollover ran only while the dashboard screen was open | Midnight missed on other screens | R-11 (no rollover needed) |

### 4.2 In the legacy spec document (contradictions between its own sections)

| # | Contradiction | Resolution in this version |
|---|---|---|
| S1 | Three different timer models were recommended: segment-only, versus `{started_at, accumulated_ms, version}` (twice). An "accumulated" field brings back the per-day stopwatch | Segment-only: a running session is a session without an end (R-01, section 6) |
| S2 | Three different command sets: start/pause/reset, start/pause/discard, start/pause/stop/edit; "pause" and "stop" were never distinguished | One set: start, stop, switch, discard, update-running (R-01, R-02, section 7) |
| S3 | "Preserve exactly: client splits at midnight" versus "split server-side" | Neither: clip at read time (R-11, D-03) |
| S4 | "Preserve: auto-update timezone from device on launch" versus "explicit toggle, no silent update" | Explicit only (R-15) |
| S5 | "Preserve exactly: title/summary dialogs with 5 s auto-skip" versus "no modal, no countdown, notes after the fact" | No blocking dialogs (R-06); the auto-skip countdown is dropped |
| S6 | "Must preserve: 0 = goal disabled" versus "disabled as explicit null" | Explicit disabled state with remembered value (R-19) |
| S7 | "Must preserve: Monday-first weeks (hard-coded)" versus a week-start setting | Setting, default Monday (R-13) |
| S8 | "Must preserve client contract quirks (24-hex ids, newest-first weekly endpoint)" although every client is being rebuilt | No legacy wire compatibility; contract designed fresh (section 7) |
| S9 | The executive summary recommended one desktop platform while the delivery section planned another platform's updater and installer | Stack decided once in section 11 |
| S10 | "Magic constants to carry over" included values the redesign removes (10 Hz tick, 10 s midnight poll, 30 s queue poll, hard-coded device name, 1 h / 10 h goal steps) | Appendix A lists only constants that remain meaningful |
| S11 | Goals "whole hours with steppers" (preserve list) versus "hours *and* minutes precision" (redesign) | Minute precision (R-19, GOAL-01) |
| S12 | "Preserve: token refresh ~2 min before expiry; session expiry returns to login" versus "never block the UI on access-token validity" | Signed in = has a valid refresh credential; offline use never needs a fresh access token (AUTH-03) |
| S13 | "Resets propagate" listed as preserved behaviour, but reset had no UI and was ambiguous (L7) | Removed; Discard replaces it |
| S14 | Line references in different parts pointed to different line ranges for the same code (for example two ranges for the same rollover routine) | All code references removed; behaviour is described by rule IDs |
| S15 | Rolling "last 30 days" was labelled "month" in the endpoint list and "30-day" in the feature list | R-13 naming |

---

## 5. Feature list (revise here)

Columns: **ID** · **Feature** · **Pri** · **Origin** · Notes / acceptance. Rule IDs point to section 3.

### 5.1 Accounts & authentication (AUTH)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| AUTH-01 | Register with email, password and name; timezone captured from the device (user can change it) | P0 | Kept | Password 8-128 chars; uniform, non-revealing errors; loading state on submit |
| AUTH-02 | Sign in / sign out; sign-out revokes this device's credentials on the server | P0 | Changed | Legacy did not revoke on the server |
| AUTH-03 | Stay signed in across restarts and while offline; the UI never blocks on access-token freshness | P0 | Changed | Offline cold start opens the app with cached data |
| AUTH-04 | Session-expired flow: clear message, sign in again, queued offline work is kept and replayed | P0 | New | |
| AUTH-05 | Devices list (name, platform, last seen); sign out one device or all | P1 | New | Revocation disconnects that device's live channel |
| AUTH-06 | Change name, email and password (password change revokes other devices) | P1 | New | |
| AUTH-07 | Password reset (email when mail is configured; admin command for self-hosters without mail) | P1 | New | |
| AUTH-08 | Delete account and all data | P1 | New | Confirmation; export offered first |
| AUTH-09 | Registration lock for self-hosted servers (invite-only or closed) | P1 | New | |
| AUTH-10 | Email verification | P2 | New | |

### 5.2 Timer (TIM)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| TIM-01 | One timer per user; Start/Stop in one action, with no dialog before or after | P0 | Changed | R-01, R-02, R-06; UI responds in under 100 ms (optimistic) |
| TIM-02 | Optional title and tag set inline before or during a session; editable while running | P0 | Changed | Legacy allowed choosing only at start |
| TIM-03 | Stop saves the session immediately; a non-blocking toast offers **Add note** and **Undo** | P0 | Changed | R-06 |
| TIM-04 | Hero display: **today's total** (live) and **current session elapsed**, both ticking at 1 Hz on the second boundary | P0 | Changed | R-17, R-18, D-02 |
| TIM-05 | Switch task: stop the current session and start a new one in one action | P1 | New | R-02 |
| TIM-06 | Discard the running session (with undo) | P0 | New | R-08 |
| TIM-07 | Adjust the running session's start ("I started 10 minutes ago") | P1 | New | Must respect R-05 |
| TIM-08 | Continue: restart with the previous title and tag in one tap | P0 | Changed | R-07 |
| TIM-09 | The timer is visible on every screen (persistent timer bar) | P0 | New | |
| TIM-10 | Accurate across sleep, lock and app close; time is computed from instants, never by counting ticks | P0 | Kept | Server owns the running session |
| TIM-11 | Away detection with keep/discard prompt (desktop) | P1 | New | R-32 |
| TIM-12 | Forgotten-timer reminder and server auto-stop | P1 | New | R-33 |
| TIM-13 | Pomodoro / break reminders (off by default) | P2 | New | |

### 5.3 Sessions & log (LOG)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| LOG-01 | Log grouped by day, with day totals and sticky day headers | P0 | Changed | Legacy was a flat table |
| LOG-02 | Range presets (Today, This week, This month, This year) and a working custom date range | P0 | Changed | Legacy date picker was a disabled placeholder |
| LOG-03 | Edit a session: start, end, title, tag, note | P0 | New | R-04, R-05 validation with clear conflict messages |
| LOG-04 | Delete a session with undo | P0 | New | R-08 |
| LOG-05 | Add a manual entry ("add missed time") | P0 | New | R-04, R-05, R-09 |
| LOG-06 | Filter by tag and search title/note text | P1 | New | |
| LOG-07 | A session crossing midnight appears once, with an indicator; stats clip it per day | P0 | Changed | R-11 |
| LOG-08 | Export CSV / JSON (all data or a range) | P1 | New | |
| LOG-09 | Multi-select to edit or delete several sessions | P2 | New | |
| LOG-10 | Split or merge sessions | P2 | New | |
| LOG-11 | Flagged sessions (auto-stopped, away) shown for review | P1 | New | R-32, R-33 |

### 5.4 Tags (TAG)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| TAG-01 | Create, rename, delete; case- and Unicode-insensitive uniqueness | P0 | Changed | R-29 (legacy had case-folding only) |
| TAG-02 | Searchable tag picker with create-from-picker; recently used tags first | P0 | New | Legacy required going to Settings |
| TAG-03 | Delete moves history to Untagged; confirmation shows the usage count | P0 | Kept | R-30 |
| TAG-04 | Tag colours | P1 | New | Used in log, picker, insights |
| TAG-05 | Archive (hidden from picker, history kept) and merge tags | P2 | New | |

### 5.5 Goals & achievements (GOAL)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| GOAL-01 | Daily, weekly and monthly goals with typed hours + minutes input and presets; each can be disabled, and the last value is remembered | P0 | Changed | R-19 |
| GOAL-02 | Effective-dated goals: changing a goal never rewrites the past | P0 | Changed | R-20 |
| GOAL-03 | Working days setting | P1 | New | R-21; the default matters before P1 (D-05) |
| GOAL-04 | Progress: worked, remaining, % (bar capped), projected finish time for today | P0 | Changed | R-28 |
| GOAL-05 | Live goal-reached celebration once per goal per period on all devices; persisted | P0 | Changed | R-27 |
| GOAL-06 | Per-weekday daily targets | P2 | New | |

### 5.6 Insights (INS)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| INS-01 | One range control (Week / Month / Year / Custom, with previous/next) and one tag filter for the whole page | P0 | Changed | R-13, R-31 |
| INS-02 | Daily bar chart with a goal line | P0 | Changed | Legacy had no goal line |
| INS-03 | Weekly trend: last N *calendar* weeks (N selectable, default 8) | P0 | Changed | L2 |
| INS-04 | Year view: monthly bars | P1 | New | Previously advertised, never built |
| INS-05 | By-tag breakdown with durations and share % (including Untagged) | P0 | Changed | R-31 |
| INS-06 | Summary: total, average per active day, best day (with date), current and longest streak, goal achievement % | P0 | Changed | R-23..R-26 |
| INS-07 | Comparison with the previous period | P1 | New | |
| INS-08 | Calendar heatmap | P2 | New | |

### 5.7 Sync & offline (SYNC)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| SYNC-01 | Live cross-device updates (timer, sessions, tags, goals, preferences) | P0 | Kept | p95 under 1.5 s |
| SYNC-02 | Every write works offline: queued durably and replayed in order, idempotently | P0 | Changed | Legacy queued only completed sessions, and dropped some |
| SYNC-03 | Offline cold start shows cached data for the signed-in user | P0 | New | |
| SYNC-04 | Sync status indicator (online / offline / syncing / N pending) and a sync-issues list | P0 | New | R-36 |
| SYNC-05 | Clock-skew correction against server time | P0 | New | Section 8.2 |

### 5.8 Notifications (NOTIF)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| NOTIF-01 | Goal reached: in-app toast and native notification; clicking focuses the app | P0 | Kept | Copy in Appendix B |
| NOTIF-02 | Forgotten-timer reminder | P1 | New | R-33 |
| NOTIF-03 | Notification preferences (per type, on/off) | P1 | New | |

### 5.9 Desktop shell (DESK)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| DESK-01 | Tray icon: show / quit (P0); live elapsed in the tooltip and a menu with Start / Stop / Continue / recent tags (P1) | P0/P1 | Changed | |
| DESK-02 | Close to tray (default on) | P0 | Kept | |
| DESK-03 | Launch at login, **starting hidden** | P0 | Changed | Legacy opened the window at login |
| DESK-04 | Global shortcut for start/stop (configurable) | P1 | New | |
| DESK-05 | Always-on-top mini timer window | P1 | New | Legacy had one, later removed |
| DESK-06 | Auto-update with signature verification; signed installers | P1 | New | |
| DESK-07 | Single instance; remembers window size and position; minimum window size; no developer menus or tools in production builds | P0 | Changed | |
| DESK-08 | Credentials stored in OS secure storage | P0 | New | |
| DESK-09 | macOS / Linux builds | P2 | New | D-09 |

### 5.10 Mobile (MOB)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| MOB-01 | Native Android app with Today, Log, Insights, Goals and Settings, sharing the client core | P1 | Changed | Legacy mobile behaviour was never analysed - see T4.0 |
| MOB-02 | Ongoing notification while running, showing elapsed time and a Stop action; battery-optimisation guidance | P1 | Kept | The foreground service behind it also keeps the realtime connection open, so the phone reflects the PC at once |
| MOB-05 | Sideloaded distribution: signed APK, in-app updater (download from the server or release page, verify, install), first-run guide for granting permissions | P1 | New | The signing key must be backed up; losing it forces users to reinstall |
| MOB-03 | Home-screen widget / quick-settings tile | P2 | New | |
| MOB-04 | iOS | P2 | New | D-10 |

### 5.11 Settings & preferences (SET)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| SET-01 | Theme light / dark / system, applied before first paint (no flash) | P0 | Changed | |
| SET-02 | Timezone shown and editable; offer to switch when the device timezone differs | P0 | Changed | R-15 |
| SET-03 | Week start; 12/24-hour time | P1 | New | R-13 |
| SET-04 | Server URL configurable in the app (self-hosting without rebuilding) | P1 | New | Also on the sign-in screen under "Advanced" |
| SET-05 | About: version from build info, update status, export client logs | P1 | Changed | Legacy version string was hard-coded |
| SET-06 | Translatable strings (no inline copy); additional languages | P2 | New | Externalising strings is cheap early |

Preferences are split into **account preferences** (synced: timezone, week start, working days, time format, goals, notification types, credit settings, classification rules) and **device preferences** (local: theme, tray, launch at login, shortcut, away threshold, activity tracking on/off, browser-extension pairing).

### 5.12 Self-hosting & operations (OPS)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| OPS-01 | One server image and a compose file with the database; non-root; health and readiness checks | P0 | Changed | Legacy image likely could not start |
| OPS-02 | Backup and restore documentation with a tested restore | P1 | Changed | |
| OPS-03 | Validated configuration; refuses weak or placeholder secrets; configurable CORS allow-list and proxy trust | P0 | Changed | |
| OPS-04 | Structured logs with request IDs (P0); metrics (P2) | P0 | Changed | |
| OPS-05 | Migrate legacy data (users, sessions, tags, goals) from the old deployment | P1 | New | D-08 |

### 5.13 Cross-cutting (X)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| X-01 | Accessibility baseline WCAG 2.2 AA | P0 | Changed | Section 9.4 |
| X-02 | Keyboard shortcuts and command palette | P1 | New | |
| X-03 | Performance and size budgets met | P0 | New | Section 9.3 |

### 5.14 Activity tracking (ACT)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| ACT-01 | Desktop (Windows) foreground-app tracking: event-driven (no polling), opt-in per device, pause, visible indicator | P1 | New | R-37..R-39; near-zero CPU |
| ACT-02 | Browser extension (Chromium-based browsers and Firefox) that reports the active tab's registrable domain to the desktop app through native messaging; window-title fallback when it is not installed | P1 | New | R-38; the native host accepts only the Pulse extension IDs |
| ACT-03 | Game detection on desktop: executables inside Steam / Epic / GOG / Xbox library folders, the server catalog, and a full-screen hint | P1 | New | R-40 |
| ACT-04 | Android foreground-app tracking via usage access, using the app's own category as a hint; runs inside the ongoing-notification service | P1 | New | R-37..R-40 |
| ACT-05 | Android browser-domain detection through an opt-in accessibility service, with a guided setup that includes "Allow restricted settings" (required for sideloaded apps since Android 13) | P1 | New | R-38 |
| ACT-06 | Activity view: per-day leisure time by category and subject, with "reclassify" on any subject | P1 | New | R-41 |
| ACT-07 | Classification: server catalog of games and social apps/domains, user rules (game / social / neutral), optional "apply to past segments" for a range | P1 | New | R-40, R-41 |
| ACT-08 | Privacy controls: exclude list, delete activity data for a range, clear explanation of what is collected | P1 | New | Principle 11 |

### 5.15 Leisure credit (CRED)

| ID | Feature | Pri | Origin | Notes / acceptance |
|---|---|---|---|---|
| CRED-01 | Earn credit from timer sessions at the earn rate, plus an optional daily free allowance | P1 | New | R-42, D-15, D-16 |
| CRED-02 | Spend credit per second of leisure; live balance on Today, in the timer bar, in the tray tooltip and in the Android ongoing notification | P1 | New | R-43..R-45 |
| CRED-03 | Low-credit warning, out-of-credit notification and repeat reminders while over | P1 | New | R-46; track only, never blocks |
| CRED-04 | Credit history: per day earned, spent and closing balance | P1 | New | R-44 |
| CRED-05 | Credit settings: earn rate, daily allowance, carry-over cap, warning threshold, reminder interval (effective-dated) | P1 | New | R-44 |
| CRED-06 | "Timer still running while on {subject}" notification | P1 | New | R-47 |
| CRED-07 | Manual credit adjustment with a note | P2 | New | |

---

## 6. Domain model (storage-agnostic)

IDs are opaque strings that **clients can generate** (time-ordered UUIDs recommended), so offline-created objects keep their ID. All instants are stored in UTC.

| Entity | Fields | Invariants |
|---|---|---|
| **User** | id, email (unique, case-insensitive), name, password hash, created/updated | |
| **AccountPreferences** | user, timezone (IANA), week start, working days, time format, notification types | One row per user |
| **Device** | id (generated on install), user, name, platform, app version, created, last seen | |
| **Credential** (refresh token) | id, device, user, token hash, family ID, issued, expires, revoked | Only hashes stored; reuse of a rotated token revokes the whole family |
| **Tag** | id, user, name, name key, colour?, archived?, created/updated, deleted? | Unique (user, name key) among non-deleted tags |
| **Session** | id, user, started at, ended at (empty = running), timezone, title?, note?, tag?, source (timer / manual / import), flags (auto-stopped, away-trimmed), device, created/updated, deleted at? | At most one running per user; no overlaps per user; end > start; title ≤ 200, note ≤ 2000 |
| **GoalSetting** | user, kind (daily / weekly / monthly), minutes or disabled, remembered minutes, effective from (day key) | One effective value per (user, kind, day) |
| **Achievement** | user, kind, period ID, achieved at, worked minutes, target minutes, seen-by devices? | Unique (user, kind, period ID) |
| **ProcessedCommand** | user, command ID, result, created | Kept at least 30 days (R-34) |
| **Revision** | user, current revision; every change record stores its revision | Increases with every change |
| **SyncIssue** (client-side) | command, error, created | Shown until resolved |
| **ActivitySegment** | id, user, device, subject kind (app / domain), subject ID, platform category hint?, resolved category (game / social / neutral), started at, ended at, deleted at? | end > start; no overlap per device; end only ever grows while the segment is open; no URLs or titles (R-38) |
| **ClassificationRule** | id, owner (a user, or none for the server catalog), subject kind, subject ID (a domain rule covers its subdomains), category, updated | Unique (owner, subject kind, subject ID) |
| **CreditSetting** | user, earn rate, daily free allowance, carry-over cap, warning threshold, reminder interval, effective from (day key) | One effective value per (user, day) (R-44) |
| **CreditAdjustment** (P2) | id, user, seconds (±), note, created | |

Statistics and credit balances are **not stored**; they are computed from Session, ActivitySegment, GoalSetting and CreditSetting (principle 7). A per-day cache is allowed only if it can be fully rebuilt and is updated in the same transaction as the change it depends on.

---

## 7. Operations & events (contract at capability level)

One contract source defines every operation, event and error. Server validation and the typed client are **generated from it**. Every incoming message is validated, including realtime messages.

### 7.1 Conventions

- Every response carries **server time**; every write carries a **command ID** (R-34).
- Errors have one shape: `code`, human-readable `message`, optional `details` (field errors, conflicting session ID) and `requestId`.
  Codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (overlap, name taken, stale revision), `RATE_LIMITED`, `UNAVAILABLE`, `INTERNAL`.
- Lists use cursor pagination. Durations are integer seconds; instants are ISO-8601 UTC; days are `YYYY-MM-DD`.
- Every resource access is checked against the authenticated user.

### 7.2 Operations

| Group | Operations |
|---|---|
| Auth | register, login, refresh, logout (this device), logout all, list devices, revoke device, change password, request reset, reset password, get me, update profile, delete account |
| Timer | get timer; **start** (title?, tag?, startedAt? for offline replay or adjustment); **stop** (endedAt? for offline replay); **switch** (title?, tag?); **discard**; **update running** (title?, tag?, startedAt?) |
| Sessions | list (range or from/to, tag?, text?, cursor); get; create manual; update; delete; restore (undo) |
| Tags | list; create (idempotent by name key); rename; delete; set colour (P1); archive / merge (P2) |
| Goals | get current and history; set (kind, minutes or disabled) |
| Preferences | get; update account preferences |
| Insights | **today snapshot** (closed today total, running session, week and month totals, goals, streak, credit balance); summary (range, tag?); series (range, granularity day / week / month, tag?); by-tag (range) |
| Activity | **upsert segments** (batch; each segment by its ID, end may only grow); list segments (range, category?, subject?); delete range |
| Classification | list catalog and user rules; set rule (subject, category, apply-to-past range?); delete rule |
| Credits | balance snapshot (balance, today earned and spent, settings); history (range, per day); get / set settings |
| Achievements | list recent / unseen; mark seen |
| Sync | changes since revision (including tombstones); subscribe to the event stream |
| Data | export; import (legacy migration / CSV) |
| Health | liveness; readiness (checks the database) |

Commands and mutations return the resulting state **and the new revision**, so the caller needs no follow-up reads.

### 7.3 Events (server to all of the user's devices)

`timer.changed`, `session.upserted`, `session.deleted`, `tag.upserted`, `tag.deleted`, `goals.changed`, `preferences.changed`, `achievement.unlocked`, `classification.changed`, `credits.changed` (new balance snapshot), `credentials.revoked` (forces sign-out on that device). Every event carries the revision. Clients never send state over the realtime channel; they send commands through the normal operations.

---

## 8. Sync, realtime & offline model

### 8.1 Sources of truth

- **Server:** sessions (including the running session), tags, goals, preferences, achievements.
- **Client:** a per-user local copy (cache plus outbox) that renders the UI instantly and offline.

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

### 8.4 Read path

- On start: render from the local copy, then fetch **changes since** the stored revision and apply them.
- While connected: apply events with a higher revision; a gap triggers a change-feed fetch.
- The realtime channel authenticates at connect, is re-authenticated when credentials rotate, and is closed by the server on revocation.

### 8.5 Conflict policy

| Situation | Outcome |
|---|---|
| Two devices start at about the same time | The first start wins; the second gets the running session back (no-op) and shows it |
| Offline device A records a session that overlaps a session made on device B | A's create is rejected as `CONFLICT`; a sync issue shows both sessions with options to adjust or discard |
| Stop arrives for a session already stopped elsewhere | No-op; the client adopts the server state |
| Edit of a session deleted elsewhere | `NOT_FOUND` creates a sync issue (offering to recreate it as a manual entry) |
| Tag deleted elsewhere while queued commands reference it | Server stores the session Untagged and reports a warning, not a rejection |

### 8.6 Account isolation on a shared device

The local copy, outbox and caches are keyed by user. Signing out closes the realtime channel and clears in-memory state; a user's outbox stays stored until that user signs in again (or is explicitly discarded). Nothing is ever read from another user's storage.

### 8.7 Where the client core runs

- **Desktop:** the client core (outbox, cache, realtime connection, clock, activity tracker) runs in the native process, not in the UI. Closing to tray **destroys the window and its web view**; only the tray and the core keep running, which keeps memory low all day. Reopening recreates the window from the local copy.
- **Android:** the same core runs inside the **foreground service** behind the ongoing notification. The service tracks activity and keeps the realtime connection open, so the phone reflects changes from the PC immediately. If the system suspends the connection while the phone is idle, the core catches up through the change feed when it wakes (8.4).

### 8.8 Activity pipeline

1. The platform tracker reports foreground changes (desktop: OS foreground events plus the browser extension; Android: usage events, and the accessibility service if enabled) to the core.
2. The core builds segments locally (R-38, R-39) and stores them in the local copy.
3. Segments are sent through the outbox as **batched upserts**: when a segment closes, and at most every 60 s while one is open (the same segment ID with a later end). Idempotency (R-34) makes resends safe.
4. The core computes the live balance (R-45) and raises credit notifications locally (R-46, R-47), online or offline.
5. The server resolves categories (R-41), recomputes the balance and sends `credits.changed` to the user's devices.

---

## 9. Non-functional requirements

### 9.1 Security (each item answers a defect class found in the legacy app)

- Validate **every** input, including realtime messages and query parameters; reject unknown fields; compare with type-safe queries (no operator or structure injection).
- Never relay raw client payloads to other devices; a malformed message must never crash the process.
- Authorisation on every resource (owner check); no client-chosen routing targets.
- Passwords hashed with a modern memory-hard algorithm; password length 8-128.
- Refresh credentials stored hashed, rotated on use, with family reuse detection; per-device revocation; logout revokes on the server.
- Login errors identical for unknown email and wrong password (including timing); rate limits per IP and per account on auth operations.
- Configuration refuses weak or placeholder secrets; CORS allow-list and proxy trust are configurable; no wildcard origins by default.
- Desktop: content security policy, navigation and new-window guards, no developer tools or menus in production, credentials in OS secure storage.
- Browser-extension bridge: the native messaging host accepts only the Pulse extension IDs and only well-formed domain messages; nothing else is forwarded.
- Android sideloading: release APKs are signed with a key kept offline and backed up; the in-app updater installs only APKs signed with the same key, downloaded over HTTPS.
- Activity data: only subject IDs leave the device (principle 11); activity data is covered by export and account deletion.
- No secrets in the repository; see Appendix C for legacy credentials that must be rotated.

### 9.2 Reliability

- Write paths that touch several records are transactional.
- Graceful shutdown, request timeouts, database connection timeouts, readiness check that includes the database.
- Versioned database migrations; never rely on implicit schema changes.
- Backups documented and a restore tested (OPS-02).
- Client: global error boundary; every failure reaches the feedback layer (toast, banner or sync issue).

### 9.3 Performance budgets

| Metric | Budget |
|---|---|
| Start/stop visual feedback | < 100 ms (optimistic) |
| Cross-device propagation | p95 < 1.5 s |
| Desktop cold start to interactive | < 1.5 s |
| Insights queries over 5 years of data (about 20k sessions) | p95 < 300 ms |
| Idle CPU with the timer running | Near zero; 1 Hz redraw of the clock only (not the whole screen) |
| Network while idle | Heartbeat only |
| Charts and other heavy views | Loaded on demand, not in the first bundle |
| Windows installer size | < 15 MB |
| Android APK size (64-bit ARM) | < 15 MB |
| Desktop memory, closed to tray with the timer running | < 50 MB |
| Android cold start to timer visible | < 1 s |
| Activity tracking cost | Desktop: event-driven, no polling. Android: checks usage events at most every 5 s and only while the screen is on; no wake-ups while it is off |

The size and memory figures are targets to confirm with the T0.7 spike; adjust them there if a measured hello-world build cannot meet them.

### 9.4 Accessibility (WCAG 2.2 AA baseline)

- Dialogs and popovers: proper roles, labelled title, focus trap, Esc closes, focus returns.
- Everything is keyboard-operable: cards, chips, menus, charts (data table alternative).
- Visible focus; selection never conveyed by colour alone; touch targets ≥ 44 px on mobile.
- Brand violet used for text only at AA-compliant lightness.
- Announce timer state changes (started / stopped) and sync status politely; never announce every second.
- Honour reduced motion.

### 9.5 Observability

- Server: structured logs with request IDs and user IDs only (no other personal data); error tracking; metrics (P2).
- Client: a rotating local log file that can be exported from About (SET-05); sync-failure diagnostics in the sync-issues view.

---

## 10. UX & design

### 10.1 Information architecture

Timer-first shell, four destinations, with Goals as a drawer:

```
+--------------------------------------------------------------------+
| [Title: What are you working on?] [Tag v]  00:42:10  [Stop]  (5h12m / 8h) o sync |
+----------+---------------------------------------------------------+
| Today    |                                                         |
| Log      |               (screen content)                          |
| Insights |                                                         |
| Settings |                                                         |
+----------+---------------------------------------------------------+
```

- **Persistent timer bar** on every screen: title input, tag picker, current-session elapsed, Start/Stop, Continue chip when idle, today's total against the daily goal, sync status dot.
- **Goals** open as a drawer from any goal ring and from Settings.
- Navigation keeps per-screen state (range, filters, scroll) and remembers the last screen.

### 10.2 Screens

| Screen | Content |
|---|---|
| **Today** | Hero: today's total (large, tabular numerals), current session elapsed with editable title and tag, big Start/Stop, Continue chip. Goal rings for day, week and month with remaining time and projected finish. Today's timeline of sessions with inline edit, add note, change tag, delete and "Add missed time". Compact chips: week total, month total, current streak, leisure credit balance (P1). |
| **Log** | Sessions grouped by day with totals; range presets and custom range; tag filter and text search (P1); row actions edit / delete; "Add entry"; midnight-crossing and review flags; virtualised list; loading, empty and error states with retry. |
| **Insights** | Range control (Week / Month / Year / Custom, previous/next) and tag filter. Summary tiles (total, average per active day, best day with date, current and longest streak, goal achievement %). Daily bars with goal line (week, month); monthly bars (year, P1); weekly trend; by-tag breakdown with share bars; previous-period comparison (P1). Goal-based tiles hidden when a tag filter is active (R-31). An **Activity** tab (P1): leisure by category and subject per day with reclassify (ACT-06), and credit history (CRED-04). |
| **Settings** | General (theme, time format, week start, timezone); Goals (opens the drawer, working days); Desktop (tray, launch at login + start hidden, global shortcut, away threshold, forgotten-timer thresholds); Notifications; Activity & credit (P1: tracking on/off and pause for this device, browser-extension status, Android permission setup, classification rules, exclude list, credit settings); Tags (create, rename, colour, delete with usage count); Account (profile, password, devices, export, delete account); Server (URL); About (version, updates, export logs). |
| **Auth** | Sign in / Create account; show-password toggle; inline field errors; loading state; "Forgot password" (P1); "Advanced: server URL" (P1); banner when the session has expired. |
| **Overlays** | Away prompt (R-32); stop toast (Add note / Undo); goal-reached toast; credit warning / out-of-credit / timer-still-running notifications (R-46, R-47); sync-issues panel; delete/discard confirmations only where undo is not possible. |

### 10.3 Key flows

1. **Start:** type a title (optional), pick a tag (optional), press Start (or the shortcut). The clock starts at once. No dialog.
2. **Stop:** press Stop. The session is saved at that instant. A toast shows "Saved 1h 12m · Add note · Undo" for 10 s; Add note opens a small popover.
3. **Continue:** when idle, the chip "Continue: <title> · <tag>" starts a new session with both.
4. **Fix a mistake:** edit or delete any session in Today or Log; overlaps are explained inline ("Overlaps 10:05-10:40 Spec review").
5. **Offline:** everything works; the sync dot turns amber with a pending count; rejected changes appear as sync issues with clear options.
6. **Midnight while running:** the today total resets at local midnight; the current session keeps counting; nothing else happens.

### 10.4 Design system rules

- **Semantic tokens from one source** (surfaces 0-3, border, text primary/secondary/disabled, accent, success/warning/danger, focus ring), generating light and dark themes. Brand violet `#7C3AED` (legacy brand) is kept; text use is tuned for contrast.
- **Typography:** one family; tabular numerals for every time display; a clear scale with at most two weights per view.
- **Spacing** on a 4 px grid; comfortable and compact density (compact for the mini window).
- **Restraint:** no per-card glows or heavy blur; hierarchy comes from size, weight and space. A single focal accent on the running timer is acceptable.
- **Components to own:** Button (including a solid destructive variant), IconButton, Input, Textarea, DurationInput, Select/Combobox (tag picker with search and create), Switch, Checkbox, SegmentedControl, Dialog, Drawer, Popover, Toast (with actions), Tooltip, TagChip (with colour), ProgressRing/Bar, List/Table (virtualised), EmptyState, Skeleton, Banner.
- **Theme before first paint**, including the native window background colour.
- Minimum desktop window about 480×640; layout adapts to width.
- Correct plurals ("1 day"); one date/time format system that follows the 12/24 h and locale settings.

---

## 11. Tech stack (decided 2026-10-24)

The legacy stack was intentionally **not** assumed. Each layer was chosen against these requirements, with small size and speed (principle 10) as the tie-breaker.

| Layer | Must provide |
|---|---|
| Server runtime | Long-lived realtime connections next to request/response; a strong timezone library with the IANA database; schema-validated contract generation; small memory footprint; runs as one container |
| Database | Transactions; unique and partial-unique constraints (one running session per user); indexed range scans by (user, time); group-by aggregation; simple backup; a single-file embedded option is worth considering for self-hosting |
| Contract | One schema source that generates server validators, a typed client and mocks; validates realtime messages too |
| Client core | Shared by desktop and mobile; no UI dependency; injected clock, storage, transport and connectivity; deterministic tests with a fake clock |
| Local persistence | Durable, transactional per-user store for cache and outbox; survives crashes |
| UI | Accessible primitives (or the ability to build them), charts, list virtualisation, theming via tokens |
| Desktop shell | Tray with dynamic text and menu; global shortcuts; autostart that starts hidden; idle, lock and sleep events; native notifications with click handling; single instance; OS secure storage; signed auto-update; small resident footprint (it runs all day) |
| Mobile shell | Android foreground service / ongoing notification with actions; secure storage; reliable background resume |
| Activity tracking (desktop) | Foreground-window change events with the executable path; idle, lock and sleep events; a bridge from a browser extension |
| Activity tracking (Android) | Usage events with app categories; an optional accessibility service; a long-running foreground service |
| Tooling | One language version per language, one formatter/linter per language, reproducible lockfiles, CI building every target |

Decision record:

| Layer | Choice | Why | Alternatives rejected |
|---|---|---|---|
| Server runtime | **NestJS** (TypeScript, Node.js LTS) | Owner's decision; structured modules, shares the TypeScript contract package | - |
| Database | **PostgreSQL** - *proposed, confirm in T0.1* | Exclusion constraint on time ranges enforces "no overlapping sessions" (R-05) in the database; partial unique index for one running session; strong range and aggregation queries | SQLite (simpler self-hosting but no exclusion constraints), MongoDB (legacy; weak for these invariants) |
| Data access | **Kysely** (D-20, decided 2026-10-24) | Typed SQL; allows the raw SQL migrations the exclusion constraint needs | Prisma (no exclusion constraints in its schema), TypeORM |
| Realtime transport | **Plain WebSocket** (NestJS `ws` adapter) | Lower per-message overhead; easy to use from Rust | Socket.IO (extra protocol, weak Rust clients) |
| Contract / schema | **One TypeScript schema package** (zod proposed) emitting OpenAPI + JSON Schema; NestJS validates from it; Rust types generated with `typify` / `progenitor` | One source for server, desktop and Android | Hand-written types per client |
| Client core | **Rust** shared by both apps: `tokio`, `reqwest` + `tokio-tungstenite` (both with `rustls`), `rusqlite` (bundled SQLite), `jiff` (embedded timezone database), `uuid` v7, `serde`; tests with `proptest` | Written once; runs without any UI; small native binary | TypeScript core (would have to be rewritten in Kotlin for the Android background service) |
| Desktop shell | **Tauri 2** with official plugins: tray, global-shortcut, autostart, notification, single-instance, updater, window-state; `windows` crate for foreground, idle and session events; `keyring` for credentials | Small installer and memory footprint; direct Windows API access from Rust; window can be destroyed in tray | Electron (80-150 MB installer, high resident memory, native add-ons needed anyway) |
| Desktop UI | **Svelte 5** + TypeScript + Vite; **Bits UI** primitives; **Tailwind CSS v4** over CSS-variable tokens; **TanStack Virtual**; `Intl` for formatting | No runtime virtual DOM, smallest output, only the clock text updates each second | React + React Aria (acceptable, slightly heavier) |
| Mobile | **Native Kotlin + Jetpack Compose** (foundation + selective Material 3), Navigation Compose, Coroutines/Flow, no DI framework; Rust core through **UniFFI** + `cargo-ndk`; Android Keystore for credentials; Baseline Profiles + R8 full mode; 64-bit ARM APK; **sideloaded** with an in-app updater (`PackageInstaller`) | Smallest APK, fastest start, most reliable long-running background service; Kotlin is required for usage access and the accessibility service anyway | React Native / Flutter (extra runtime size; JS/Dart engine tied to the UI, so background work needs a separate path), Tauri on Android (unproven that the core keeps running in a foreground service with no window; revisit if maintaining two UIs becomes costly) |
| Local persistence | SQLite inside the Rust core (cache, outbox, segments) on both platforms | One implementation, transactional, survives crashes | Room / IndexedDB (per-platform duplicates) |
| Charts | **uPlot** (desktop), **Vico** (Android) | Small and fast; each paired with a data-table view for accessibility | Heavier chart suites |
| Browser extension | **WXT** (one TypeScript codebase for Chromium MV3 and Firefox); **native messaging** to a small host shipped with the desktop app | Reliable domain detection; native messaging keeps the extension's service worker alive while connected and cannot be spoofed by other local processes the way a local HTTP port can | Reading the address bar through UI Automation (fragile), local HTTP server |
| Testing / E2E | Rust: `cargo test` + `proptest`; desktop UI: Vitest; desktop E2E: WebdriverIO + `tauri-driver`; Android: Compose UI tests + **Maestro**; server: integration tests against a real database | | |
| Repo / tooling | **pnpm workspace** (server, contract, desktop UI, extension) + **Cargo workspace** (core, desktop shell, native host) + Gradle Android project building the core through `cargo-ndk` | | |
| CI / release | TBD in T0.3 (GitHub Actions proposed) | Must build Windows, Android and the server image | |

---

## 12. Task distribution

### 12.1 Workstreams

| WS | Name | Owns | Main features |
|---|---|---|---|
| WS0 | Foundations | Repo, tooling, contract, decisions | - |
| WS1 | Server platform | Schema, migrations, config, errors, logging, preferences | OPS-03, OPS-04, SET-02/03 |
| WS2 | Auth & accounts | Credentials, devices, account management | AUTH-* |
| WS3 | Timer & sessions | Commands, session CRUD, tags, integrity guards | TIM-*, LOG-*, TAG-* |
| WS4 | Goals & insights | Goals, statistics, achievements, export | GOAL-*, INS-*, LOG-08 |
| WS5 | Realtime & change feed | Event stream, revisions, change feed | SYNC-01 |
| WS6 | Client core | Transport, clock, projection, outbox, cache, sync status | SYNC-*, AUTH-03/04 |
| WS7 | Design system | Tokens, primitives, theming | SET-01, X-01 |
| WS8 | App UI | Screens and flows | All UI-facing features |
| WS9 | Desktop shell | Tray, autostart, shortcuts, away, notifications, mini window | DESK-*, TIM-11, NOTIF-* |
| WS10 | Mobile | Android shell and screens | MOB-* |
| WS11 | Ops & release | Image, compose, CI/CD, signing, updates, backups | OPS-*, DESK-06 |
| WS12 | Quality | Test suites, security, accessibility and performance passes | X-01, X-03 |
| WS13 | Activity & credit | Trackers, browser extension, classification, credit ledger | ACT-*, CRED-* |

**Parallel lanes.** Once the contract (T0.4) and time math (T0.5) exist:

- **Lane A (server):** WS1-WS5.
- **Lane B (client):** WS6-WS8, working against generated mocks.
- **Lane C (shell & ops):** WS9 and WS11.

Lanes meet at the end of each milestone for integration. WS12 runs alongside all lanes.

```
M0 Foundations --> M1 Walking skeleton --> M2 Core MVP --> M3 Desktop MVP release (Windows)
                                                       \--> M4 Android
                                         M3 + M4 --> M5 v1.0 --> Backlog (P2)
                                         M3 + M4 --> M6 Activity & credit (part of v1.0, can run alongside M5)
```

### 12.2 M0 - Decisions & foundations

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T0.1 | Resolve the open decisions (section 13) and choose the stack (section 11); record each decision. *Stack chosen 2026-10-24; D-19, D-20 decided 2026-10-24; still open (to revisit with the owner's user stories): database confirmation, D-02..D-08, D-11..D-18* | WS0 | - | all | Decision record complete; this spec updated |
| T0.2 | Repo scaffold organised by module boundaries (server, contract, client core, UI kit, app, desktop, mobile); formatter, linter, type checks; one language version; config templates | WS0 | T0.1 | - | A fresh clone installs and passes all checks with one command |
| T0.3 | CI: reproducible install, lint, type check, tests, build of every target; required on the main branch | WS0/WS11 | T0.2 | - | Pull requests blocked on red CI |
| T0.4 | Contract: operations, events and error model of section 7, generating server validators, a typed client and a mock server | WS0 | T0.2 | §7 | Server stub and client both compile against it; mock server runs; every generated file lives under a `generated/` folder or starts with an `@generated` comment line (so agent guards refuse hand edits) |
| T0.5 | Time-math module: day keys, period ranges with week start, clipping across midnight, period IDs; injected clock; timezone test matrix | WS6 | T0.2 | R-10..R-14, R-16..R-18 | Tests green for UTC, America/Los_Angeles, Asia/Dhaka, Pacific/Auckland, Asia/Kathmandu, and 23 h / 25 h DST days |
| T0.6 | Local development environment: database, server and seed data with one command | WS11 | T0.2 | - | New contributor running in < 10 min |
| T0.7 | Size spike: hello-world Tauri 2 + Svelte installer, and Kotlin + Compose APK loading the Rust core through UniFFI, plus a foreground service that keeps the core running with no activity | WS0 | T0.2 | §9.3 | Measured sizes, memory and cold start recorded in section 9.3; budgets confirmed or adjusted |

### 12.3 M1 - Walking skeleton (register, start, stop, see today's total)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T1.1 | Schema and migrations for section 6 (one-running and no-overlap guarantees, revisions, processed commands) | WS1 | T0.4 | §6 | Migrations apply and roll back on an empty DB; constraint tests pass |
| T1.2 | Server platform: config validation, error model, request IDs, structured logs, liveness/readiness, graceful shutdown, timeouts, CORS and proxy settings | WS1 | T0.4 | OPS-03, OPS-04 | Bad config fails fast with a clear message; every error has the standard shape |
| T1.3 | Auth core: register, login, refresh with rotation and reuse detection, logout this device, rate limits | WS2 | T1.1, T1.2 | AUTH-01, AUTH-02 | Security tests: reusing a token revokes the family; login errors are uniform |
| T1.4 | Timer commands: start, stop, discard, update running; idempotency store; per-user serialisation; revision bump; server timestamps | WS3 | T1.1 | TIM-01/02/03/06, R-01..R-05, R-34 | Property tests: any command sequence leaves ≤ 1 running session and no overlaps; replaying an ID returns the same result |
| T1.5 | Today snapshot and period totals | WS4 | T1.4, T0.5 | TIM-04, R-11, R-17 | Totals match hand-computed fixtures, including sessions crossing midnight |
| T1.6 | Rust client core v0: transport with timeouts and normalised errors; single-flight credential refresh; secure-storage interface; clock-offset estimator; timer projection; 1 Hz second-aligned ticker | WS6 | T0.4, T0.5 | AUTH-03, SYNC-05, TIM-10 | Unit tests with fake clock and simulated skew |
| T1.7 | Design tokens and base primitives (Button, IconButton, Input, Dialog, Popover, Toast, Skeleton); theme before first paint | WS7 | T0.2 | SET-01, X-01 | Light/dark render without flash; primitives pass keyboard and screen-reader checks |
| T1.8 | App shell, auth screens, persistent timer bar and Today hero, wired to the real server | WS8 | T1.3, T1.5, T1.6, T1.7 | AUTH-01/02, TIM-01..04, TIM-09 | Demo: register, start, stop; today's total and current elapsed are correct |
| T1.9 | Desktop shell v0 (Tauri 2): window with minimum size and remembered position, single instance, production hardening (no developer tools or menus, CSP, navigation guards), secure storage; client core hosted in the native process, window destroyed when closed to tray | WS9 | T0.2 | DESK-07, DESK-08 | Installer runs the skeleton on Windows within the size budget |
| T1.10 | Server image and compose file with the database (non-root, health checks) | WS11 | T1.2 | OPS-01 | Fresh compose up yields a working server; smoke test in CI |

### 12.4 M2 - Core MVP

**Server**

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T2.1 | Session CRUD: manual create, edit, soft delete, restore; overlap / future / minimum-duration validation; timezone capture | WS3 | T1.4 | LOG-03/04/05, R-04, R-05, R-08, R-09 | Conflict errors identify the overlapping session; undo restores exactly |
| T2.2 | Tags: CRUD with normalised key, idempotent create, detach on delete (including the running session), usage counts | WS3 | T1.1 | TAG-01, TAG-03, R-29, R-30 | Unicode look-alike names collide; deleting a tag leaves its sessions Untagged |
| T2.3 | Goals: effective-dated settings; disabled state with remembered value | WS4 | T1.1 | GOAL-01, GOAL-02, R-19, R-20 | A goal change today does not alter last week's results |
| T2.4 | Insights: summary, series (day / week granularity), by-tag, tag filter; session listing with cursor and filters | WS4 | T0.5, T2.3 | INS-01/02/03/05/06, LOG-01/02, R-21..R-26, R-31 | Fixture suite covers streak, achievement %, best-day ties, working days, tag filter |
| T2.5 | Achievements: detect on every worked-time change; schedule live crossing for the running session; persist once per period; unseen feed | WS4 | T2.3, T2.4 | GOAL-05, R-27 | Crossing while running fires once at the right second; reconnecting devices receive it |
| T2.6 | Realtime channel: auth at connect, per-user fan-out, message validation, close on revocation, events with revision; fan-out works with more than one server instance | WS5 | T1.4 | SYNC-01, R-35 | Malformed messages cannot crash the process; p95 propagation < 1.5 s |
| T2.7 | Change feed since revision, including tombstones | WS5 | T2.1, T2.2, T2.3 | SYNC-02, SYNC-03 | A client offline for 30 days converges with one call |
| T2.8 | Account preferences: timezone, week start, working days, time format | WS1 | T1.1 | SET-02, R-12, R-15 | Changing the week start changes "this week" everywhere consistently |

**Client core**

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T2.9 | Durable per-user outbox for every write; ordered replay with backoff; optimistic projection; rejections become sync issues | WS6 | T1.6 | SYNC-02, SYNC-04, R-34, R-36 | Killing the app at any point loses nothing; no duplicates after lost responses |
| T2.10 | Per-user local cache; offline cold start; apply events and change feed by revision | WS6 | T2.6, T2.7 | SYNC-01, SYNC-03, AUTH-03 | Airplane-mode cold start shows correct data and accepts commands |
| T2.11 | Session-expired flow: keep the outbox, ask the user to sign in again, resume replay | WS6/WS8 | T2.9 | AUTH-04 | Expiring credentials mid-offline loses nothing |

**App UI**

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T2.12 | Today screen complete: goal rings with remaining time and projected finish, timeline with inline edit, Continue chip, stop toast with Add note / Undo, discard with undo | WS8 | T2.1, T2.3, T2.9 | TIM-03/06/08, GOAL-04, LOG-03 | Every Today action works offline and reconciles |
| T2.13 | Log screen | WS8 | T2.1, T2.4 | LOG-01..05, LOG-07 | 5 years of data scrolls smoothly; edits validate inline |
| T2.14 | Tag picker (search, create, recent first) and tag management | WS8 | T2.2 | TAG-01..03 | Keyboard-only tag creation from the timer bar |
| T2.15 | Goals drawer (typed hours + minutes, presets, enable/disable) | WS8 | T2.3 | GOAL-01 | 90-minute goal round-trips exactly |
| T2.16 | Insights screen | WS8 | T2.4 | INS-01/02/03/05/06 | Matches server fixtures; tag filter hides goal metrics |
| T2.17 | Settings: General (with timezone prompt), Tags, Account (view), sign out, About with build version | WS8 | T2.8 | SET-01, SET-02 | Timezone never changes without confirmation |
| T2.18 | Feedback layer: sync status and issues panel, error boundary, loading / empty / error states on every screen | WS8 | T2.9 | SYNC-04 | No screen shows blank content while loading or on failure |
| T2.19 | Goal-reached celebration (toast and native notification), deduplicated by period | WS8/WS9 | T2.5 | NOTIF-01 | Shown once per period per device, including after restart |

**Quality**

| ID | Task | WS | Deps | Done when |
|---|---|---|---|---|
| T2.20 | Two-client simulator with skewed clocks, random disconnects and offline replay | WS12 | T2.9, T2.10 | All clients converge to the server state in every generated scenario |
| T2.21 | Security pass: authorisation on every resource, input fuzzing (including realtime), credential reuse, rate limits | WS12 | T2.6 | No findings above low severity |

### 12.5 M3 - Desktop MVP release (Windows)

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T3.1 | Tray: show / quit (P0); live elapsed in the tooltip and a quick-action menu (P1) | WS9 | T1.9, T2.10 | DESK-01 | Start/stop from the tray with the window closed |
| T3.2 | Close to tray; launch at login starting hidden | WS9 | T1.9 | DESK-02, DESK-03 | Login start shows only the tray |
| T3.3 | Away detection and prompt | WS9/WS6 | T2.9 | TIM-11, R-32 | Lock for 15 min, return: prompt offers the three choices, and each produces the right sessions |
| T3.4 | Forgotten-timer reminder; server auto-stop with review flag | WS3/WS9 | T1.4 | TIM-12, NOTIF-02, LOG-11, R-33 | Thresholds configurable and can be turned off |
| T3.5 | Native notifications with click-to-focus; notification preferences | WS9 | T2.19 | NOTIF-01, NOTIF-03 | |
| T3.6 | Global shortcut, in-app shortcuts, command palette | WS9/WS8 | T1.9 | DESK-04, X-02 | |
| T3.7 | Packaging, code signing, signed auto-update | WS11 | T1.9 | DESK-06 | Update from version N to N+1 without reinstalling |
| T3.8 | End-to-end desktop tests: start / stop / edit / offline / tray / away | WS12 | T3.1..T3.5 | - | Green in CI on Windows |
| T3.9 | Release gate: accessibility audit, performance budgets, backup docs, release notes | WS12/WS11 | all M3 | X-01, X-03, OPS-02 | Checklist signed off; MVP published |

### 12.6 M4 - Android

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T4.0 | Investigate legacy mobile-only behaviour (foreground service, battery-optimisation prompts, build/signing); the legacy spec did not cover mobile | WS10 | - | MOB-* | Short findings note added to this spec |
| T4.1 | Native Kotlin + Compose app using the Rust core through UniFFI; Keystore-backed credentials; navigation | WS10 | T2.10, T4.0, T0.7 | MOB-01 | Sign in, start and stop on a device |
| T4.2 | Screens in Compose: Today, Log, Insights, Goals, Settings | WS10 | T4.1 | MOB-01 | Feature parity with desktop P0 |
| T4.3 | Foreground service hosting the core: ongoing notification with live elapsed time and Stop, realtime connection, battery-optimisation guidance | WS10 | T4.1 | MOB-02 | Timer visible and stoppable with the app closed; a start on the PC appears on the phone within the propagation budget |
| T4.4 | Android build, signing and release pipeline; sideload distribution with in-app updater | WS11 | T4.1 | MOB-05 | Signed release built by CI; the app updates itself from N to N+1 |
| T4.5 | End-to-end mobile flows, including offline and cross-device with desktop | WS12 | T4.2 | - | |

### 12.7 M5 - v1.0

| ID | Task | WS | Deps | Features / rules |
|---|---|---|---|---|
| T5.1 | Account management: profile, email, password change (revokes other devices), devices list and revoke, sign out of all devices | WS2/WS8 | T1.3 | AUTH-05, AUTH-06 |
| T5.2 | Password reset (email if configured; admin command otherwise) | WS2 | T5.1 | AUTH-07 |
| T5.3 | Delete account; export CSV / JSON | WS2/WS4 | T2.1 | AUTH-08, LOG-08 |
| T5.4 | Registration lock; server URL setting in the app and on sign-in | WS2/WS8 | T1.3 | AUTH-09, SET-04 |
| T5.5 | Legacy data migration tool (if D-08 = yes) | WS1 | T2.1..T2.3 | OPS-05 |
| T5.6 | Switch task; adjust running start | WS3/WS8 | T1.4 | TIM-05, TIM-07 |
| T5.7 | Working days UI; week start and time format UI | WS8 | T2.8 | GOAL-03, SET-03 |
| T5.8 | Insights v1: year view, comparison with the previous period | WS4/WS8 | T2.4 | INS-04, INS-07 |
| T5.9 | Tag colours; log tag/text filter | WS3/WS8 | T2.2 | TAG-04, LOG-06 |
| T5.10 | Mini always-on-top window | WS9 | T3.1 | DESK-05 |
| T5.11 | About: update status, client log export | WS8/WS9 | T3.7 | SET-05 |
| T5.12 | Backup/restore tested; operations docs | WS11 | T1.10 | OPS-02 |

### 12.8 M6 - Activity tracking & leisure credit

| ID | Task | WS | Deps | Features / rules | Done when |
|---|---|---|---|---|---|
| T6.1 | Contract, schema and migrations for ActivitySegment, ClassificationRule, CreditSetting; operations and events of section 7 | WS13 | T2.7 | §6, §7 | Contract compiles for server and Rust core; migrations apply and roll back |
| T6.2 | Server: batched segment upsert (idempotent, end only grows, no overlap per device), category resolution, user rules with apply-to-past | WS13 | T6.1 | ACT-07, R-38..R-41 | Rule precedence fixtures pass; resent batches create no duplicates |
| T6.3 | Server: credit balance and history (earn rate, allowance, carry-over cap, effective-dated settings); rebuildable per-day cache; `credits.changed` | WS13 | T6.1, T2.4 | CRED-01, CRED-04, CRED-05, R-42..R-44 | Fixture suite covers settings changes, carry-over cap, negative balances, sessions crossing midnight |
| T6.4 | Rust core: local segment builder (R-39), batched upsert through the outbox, live balance (R-45), local notification triggers (R-46, R-47) | WS13/WS6 | T6.1, T2.9 | CRED-02, CRED-03, CRED-06 | Fake-clock tests: each notification fires once per crossing, offline included |
| T6.5 | Desktop tracker: foreground events, idle/lock/sleep integration, game-library detection, window-title fallback | WS13/WS9 | T6.4, T3.3 | ACT-01, ACT-03 | Switching apps produces correct segments; no measurable CPU at rest |
| T6.6 | Browser extension (WXT) + native messaging host + pairing and status in Settings | WS13 | T6.5 | ACT-02 | Domain changes in Chrome, Edge and Firefox reach the core; only domains are sent |
| T6.7 | Android tracker in the foreground service: usage events, category hints, screen-off handling | WS13/WS10 | T6.4, T4.3 | ACT-04 | Segments match actual usage; no wake-ups with the screen off |
| T6.8 | Android accessibility-service domain detection (opt-in) with guided permission setup | WS13/WS10 | T6.7 | ACT-05 | Works in Chrome after the guided setup on Android 13+ |
| T6.9 | Seed catalog of games and social apps/domains, and how it is updated | WS13 | T6.2 | ACT-07 | Top social apps and sites, and common store-installed games, are classified out of the box |
| T6.10 | UI on both platforms: balance in Today, timer bar, tray and ongoing notification; Activity tab with reclassify; credit history; Activity & credit settings; privacy controls | WS8/WS10 | T6.3, T6.4 | ACT-06, ACT-08, CRED-02, CRED-04, CRED-05 | A reclassified subject updates the balance on both devices |
| T6.11 | Quality: simulator with sessions and segments across two devices; privacy test (no URLs or titles in any request); CPU and battery measurement | WS12 | T6.5, T6.7 | Principle 11, §9.3 | Budgets met; privacy test green |

### 12.9 Backlog (P2)

AUTH-10 email verification · TIM-13 Pomodoro / breaks · LOG-09 bulk edit · LOG-10 split / merge · TAG-05 archive / merge · GOAL-06 per-weekday targets · INS-08 heatmap · MOB-03 widget / tile · MOB-04 iOS · DESK-09 macOS / Linux · SET-06 languages · OPS-04 metrics · CRED-07 manual credit adjustment · web client · calendar integration · deep links.

### 12.10 Testing strategy (owned by WS12, written by every workstream)

| Level | What |
|---|---|
| Unit | Time math across the timezone matrix and DST days; goal, streak and achievement math; credit balance math; segment building and merging; formatters; tag-name normalisation |
| Property | Timer command reducer (any order and timing gives at most one running session and no overlaps); outbox replay is idempotent |
| Simulation | Multiple clients with skewed clocks, disconnects and offline periods converge (T2.20) |
| Contract | Server and client conform to the shared contract; generated mocks match the real server |
| Integration | Each operation against a real database, including authorisation checks |
| E2E | Per platform: register → start → stop → note → edit → insights → goal toast; offline round trip; tray / notification flows |
| Non-functional | Security pass (T2.21), accessibility audit, performance budgets (section 9.3), visual regression in light and dark |

---

## 13. Open decisions (resolve in T0.1, then update the affected rules)

| ID | Question | Recommendation | Affects |
|---|---|---|---|
| D-01 | Tech stack per layer | **Decided 2026-10-24** (section 11); the database is still a proposal | Everything |
| D-02 | Hero clock: today's total or current session first? | Today's total large, current session secondary (keeps Pulse's identity) | TIM-04 |
| D-03 | Sessions across midnight: clip at read time, or split into two records? | Clip at read time (no rollover logic, one record, history stable) | R-11, LOG-07 |
| D-04 | Streak definition | R-22/R-23 (goal-based, working days skipped, unfinished today never breaks the streak) | INS-06 |
| D-05 | Default working days: all 7 (legacy) or Mon-Fri (matches the 40 h / 160 h defaults) | Mon-Fri | R-21, R-24, GOAL-03 |
| D-06 | Forgotten-timer thresholds | Remind at 8 h, auto-stop at 16 h, both configurable / off | R-33 |
| D-07 | Away prompt default when ignored | Keep all time (non-destructive) | R-32 |
| D-08 | Migrate data from the legacy deployment? | Yes, if there is history worth keeping | OPS-05, T5.5 |
| D-09 | Platforms for v1 | **Decided:** Windows + Android (sideloaded APK, not Google Play); others P2 | DESK-09, MOB-04, MOB-05 |
| D-10 | iOS in scope? | Later. iOS's Screen Time API never tells an app which app is in use, so activity tracking (ACT-*) cannot exist on iOS | MOB-04 |
| D-11 | Hosting model: personal self-host only, or a public hosted instance with open registration? | Self-host first; registration lock available | AUTH-09, rate limits |
| D-12 | Celebrate goals reached for past periods via edits/manual entries? | No (only current periods celebrate) | R-27 |
| D-13 | Refresh-credential lifetime | 30 days, rotating, extended with use, so a desktop left offline for a week stays signed in | AUTH-03 |
| D-14 | Minimum session duration / accidental clicks | 1 s minimum; rely on Undo rather than auto-deleting short sessions | R-04 |
| D-15 | Earn rate: leisure seconds per worked second | 0.25 (15 min of leisure per hour worked), configurable | R-42, CRED-01 |
| D-16 | Daily free leisure allowance | 0 by default, configurable | R-42, CRED-01 |
| D-17 | Does unused credit carry over? | Carries over; optional cap (default: no cap) | R-44, CRED-05 |
| D-18 | Which categories count as leisure? | `game` and `social` (decided); open: should video sites and apps (YouTube, Netflix) be a third leisure category or stay under `social` / `neutral` by catalog entry? | R-40, ACT-07 |
| D-19 | Time and credit math run on the server (TypeScript) and in the client core (Rust). How do they keep one definition (principle 3)? | **Decided 2026-10-24:** one shared fixture suite (`packages/contract/fixtures/`: time zones, DST days, sessions across midnight, credit cases) that both implementations must pass in CI; revisit compiling `pulse-core` as a Node addon if they drift | R-10..R-18, R-42..R-47, T0.5 |
| D-20 | Server data access library (section 11 "TBD in T0.1") | **Decided 2026-10-24:** Kysely: typed SQL with raw migrations, which the exclusion constraint for R-05 needs | Section 11, T1.1 |

Decided 2026-10-24 alongside the stack: activity tracking is **track-and-notify only** (no blocking); credit is earned **only from the manual timer**; a user uses one device at a time, and everything syncs live.

---

## Appendix A. Defaults & limits

| Item | Value |
|---|---|
| Default goals | Daily 8 h · Weekly 40 h · Monthly 160 h (minute precision) |
| Week start / working days | Monday / Mon-Fri (D-05) |
| Title / note / tag name / user name | ≤ 200 / ≤ 2000 / 1-50 / 1-100 characters |
| Password | 8-128 characters |
| Access / refresh credential lifetime | 15 min / 30 days rotating (D-13) |
| Idempotency retention | ≥ 30 days |
| Undo window (stop, discard, delete) | 10 s |
| Away threshold | 10 min (configurable) |
| Forgotten timer | Remind 8 h, auto-stop 16 h (D-06) |
| Future-time tolerance | 60 s |
| Clock tick | 1 Hz, aligned to second boundaries |
| Log page size | 50 |
| Weekly trend default | 8 calendar weeks |
| Cross-device propagation target | p95 < 1.5 s |
| Toast duration (goal reached) | 6 s |
| Brand colour | `#7C3AED` |
| Earn rate / daily free allowance | 0.25 / 0 (D-15, D-16) |
| Credit warning threshold / reminder interval while over | 5 min left / every 15 min |
| Leisure during a running timer before notifying | 5 min (R-47) |
| Activity segment minimum / merge gap | 5 s / 5 s (R-39) |
| Open-segment flush interval | 60 s |
| Android usage-event check interval (screen on) | ≤ 5 s |
| Size budgets | Installer < 15 MB · APK < 15 MB · tray memory < 50 MB (section 9.3) |

## Appendix B. Copy deck (kept from legacy, plurals fixed)

| Event | Title | Message |
|---|---|---|
| Daily goal | Daily goal reached! | You've logged {duration} today. Great work! |
| Weekly goal | Weekly goal reached! | You've logged {duration} this week. Keep it up! |
| Monthly goal | Monthly goal reached! | You've logged {duration} this month. Amazing progress! |
| Stop | Session saved | {duration} · Add note · Undo |
| Title placeholder | | What are you working on? |
| Note placeholder | | What did you accomplish? |
| Streak | | {n} day / {n} days |
| Credit warning | Leisure credit running low | {duration} of leisure credit left. |
| Out of credit | Out of leisure credit | You've used all your leisure credit. |
| Over reminder | Still over your leisure credit | You're {duration} over. |
| Timer while on leisure | Timer still running | Your timer is running while you're on {subject}. |

## Appendix C. Legacy carry-over actions

- **Rotate credentials:** the legacy API's local environment file (never committed) contained live-looking hosted-database credentials. Rotate them if that folder was ever shared.
- **Existing users:** legacy clients (v0.0.5, Windows and Android, git tags `win-v0.0.5` and `android-v0.0.5`) point at the legacy hosted API. Plan the switch: migrate data (D-08), then publish new clients pointing at the new server; the legacy API can be retired afterwards.
- **Brand assets:** the legacy brand-asset generator needed a source logo folder that was not in the repository. Commit the source logo (preferably vector) with the rebuild.
