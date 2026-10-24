# Work Hours Tracker: Product Requirements & User Stories

Oct 24, 2026 · @Naimur

> **About this file.** The owner's product requirements, received 2026-10-24 as a Word document and transcribed here unchanged (only formatting was converted to Markdown). It is the **input** to `docs/REBUILD_SPEC.md`: every spec feature cites the user stories (`US-x.y`) it delivers, and every AC is a testable requirement. Where the spec settles something this document leaves open or deliberately implements it differently, spec section 13 says so (D-03, D-15, D-21, D-22). The two open questions at the end were answered by the owner on 2026-10-24: default rates as proposed (D-15); tracked distraction during a Productive session earns nothing and is charged (D-21). Look up a story with `node scripts/spec.mjs US-5.2`.

## 1. Overview

The product is a cross-device work-hours tracker: a user times their work sessions, sees daily, weekly and monthly totals with emphasis on productive hours, and earns credits for productive time that are spent on gaming and social media.

Platforms (v1): a Windows desktop app and an Android mobile app (sideloaded APK), both talking to one backend. There is no web app and no iOS app in v1.

Users: individuals with their own accounts. The owner will use it first and share it with friends, so the full standard sign-up flow is required. Users never see each other's data. There is no admin panel.

**Core principles**

- Real time: the timer state is identical on every device of the same user within about 1 second.
- Fast: starting or pausing the timer must feel instant (optimistic UI, server confirms).
- Self-hostable: one Docker Compose command brings up everything on a VPS or AWS EC2.

**How the coding agent should use this document**

- The tech stack is already chosen in the agent setup; this document does not prescribe frameworks.
- Each epic lists user stories (US-x.y) with acceptance criteria (AC). Treat every AC as a testable requirement.
- Where a value is marked configurable, store it in settings or server config, never hard-code it.
- Section 13 lists delivery phases; build in that order.

## 2. Glossary

| Term | Meaning |
|---|---|
| Session | One continuous run of the timer, from start/resume to pause. Has an optional title, optional tag, optional summary, start time, end time, duration. |
| Current session timer | Elapsed time of the running session. Resets to 0 on every new start/resume. |
| Day total timer | Sum of all session time in the current local day. Never resets on pause; resets only at local midnight. |
| Local day | 00:00 to 23:59:59 in the user's timezone (set in settings, defaulted from the device). |
| Tag | A user-defined label (e.g. "Deep Work") that belongs to exactly one category. |
| Category | One of three fixed values: Productive (green), Leisure (orange), Neutral (blue). |
| Untagged | A session with no tag. Counts as Neutral for stats and earns no credits. |
| Credit | The currency earned by productive time and spent by leisure time and tracked distracting usage. Can go negative. |
| Distraction class | A class of tracked app/site usage that costs credits: Gaming or Social Media. |
| Usage rule | A mapping from an app (Windows executable / Android package) or website domain to a distraction class. |
| Goal | A target of productive hours for a day, a week or a month. Optional. |
| Streak | Number of consecutive local days on which the daily goal was met. |

## 3. Repository and deployment

Everything lives in one monorepo, and the backend ships as a Docker image that runs with or without an external database.

**Monorepo layout (indicative)**

```
/apps
  /backend        API + real-time server + scheduled jobs
  /desktop        Windows desktop app
  /mobile         Android app
/packages
  /shared         shared types, API contracts, validation schemas, constants
                  (category colors, default usage rules, credit formula)
/infra
  docker-compose.yml
  .env.example
/docs
  this document
```

Shared business rules (credit math, midnight split, category colors) live in /packages/shared so all apps compute them identically; the backend remains the source of truth.

**Deployment requirements**

- `docker compose up -d` on a fresh VPS or EC2 instance starts a working system. No other manual installs.
- Hybrid database: if DATABASE_URL is set in .env, the backend uses that database and the bundled database container is not needed (use a Compose profile, e.g. `--profile db`, to start the bundled one). If DATABASE_URL is empty, the bundled database container is used, with data on a named volume.
- Database migrations run automatically on backend start.
- A health endpoint (/health) reports API and database status.
- Optional reverse proxy service with automatic HTTPS for a configured domain (the desktop and mobile apps need HTTPS and WSS in production).
- The README covers: first deploy, updating to a new version, backup and restore of the bundled database, building the desktop installer and the Android APK.

**Environment variables (.env.example)**

| Variable | Purpose |
|---|---|
| DATABASE_URL | External database. Empty = use bundled container. |
| JWT_SECRET / REFRESH_SECRET | Token signing. |
| PUBLIC_API_URL | Base URL the apps and email links use. |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Google OAuth. |
| SMTP_USER / SMTP_APP_PASSWORD | Gmail account and app password for Nodemailer. |
| MAIL_FROM | Sender name and address. |
| FCM_* | Android push notifications (Firebase Cloud Messaging). |
| DOMAIN | Domain for the HTTPS reverse proxy (optional). |

## 4. Epic: Authentication and accounts

**US-4.1 Sign up with email and password.** As a new user, I want to create an account with my email and a password so that my data is saved and synced.
- AC: Password minimum 8 characters; email must be unique (case-insensitive).
- AC: A verification email with a link (valid 24 h) is sent via Nodemailer/Gmail. Unverified users cannot log in and see a "Resend verification email" action (rate limited to 1 per minute).
- AC: On first login the user is asked to confirm their timezone (pre-filled from the device) and receives the starter tags (US-6.1).

**US-4.2 Sign in with Google.** As a user, I want to sign in with Google so that I don't need a password.
- AC: Works on both Windows (system browser + loopback or deep-link redirect) and Android.
- AC: If a Google account's email matches an existing email/password account, the accounts are linked rather than duplicated.
- AC: Google accounts are treated as verified.

**US-4.3 Log in and stay logged in.** As a user, I want to stay logged in on each device so that I don't re-enter credentials every time.
- AC: Short-lived access token plus long-lived refresh token, stored in the OS secure storage (Windows Credential Manager, Android Keystore).
- AC: Settings shows the list of signed-in devices with a "Sign out" action per device.

**US-4.4 Reset password.** As a user who forgot my password, I want a reset link by email.
- AC: Reset link valid 1 hour, single use; using it signs out all other devices.
- AC: The response never reveals whether an email exists.

**US-4.5 Change email or password.** As a user, I want to change my password and email from settings. A new email requires re-verification.

**US-4.6 Delete account.** As a user, I want to permanently delete my account and all my data.
- AC: Requires typing the word DELETE plus password (or Google re-auth).
- AC: All sessions, tags, credits, usage totals and devices are hard-deleted; a confirmation email is sent.

**US-4.7 Export my data.** As a user, I want to download all my data (JSON) before deleting the account.

## 5. Epic: Timer and sessions

A user has at most one running session at a time across all devices; every start, resume and pause is a server-side event broadcast to all of that user's devices.

**US-5.1 Main screen with two timers.** As a user, I want to see how long my current session has run and how much I've worked today.
- AC: The main screen shows (a) the current session timer, (b) the day total timer, (c) the current title and tag (tag shown as a colored chip in the category color, never the category name), (d) one primary Start/Resume or Pause button, (e) today's productive hours vs daily goal and current credit balance.
- AC: Timers tick every second locally from the server-provided start timestamp, so all devices show the same value without drift.

**US-5.2 Start or resume with the session dialog.** As a user, when I press Start/Resume, I want to optionally give the session a title and tag.
- AC: Pressing Start/Resume starts the timer immediately (the start time is the button press, not the dialog close) and opens a dialog with: Title (text, optional), Tag (picker of active tags shown with category colors, optional), "+ New tag" inline action (name + category), Confirm button, and a visible 5-second countdown.
- AC: Any interaction with the dialog (typing, focusing, opening the tag picker) cancels the countdown; the dialog then waits for Confirm or Close.
- AC: If the countdown reaches 0, the dialog closes and the current values are saved.
- AC: First session of the user's account: fields are empty.
- AC: Every later start: fields are pre-filled with the title and tag of the user's most recent session (even if it was yesterday), so a break-then-resume continues the same task with zero input.
- AC: Title and tag can be edited later while the session runs (tap the title/tag on the main screen).

**US-5.3 Pause with the summary dialog.** As a user, when I pause, I want to optionally note what I did.
- AC: Pressing Pause stops the timer immediately (end time = button press) and opens a dialog with a Summary field (multi-line, optional), Save button and a 5-second countdown, with the same cancel-on-interaction behaviour as US-5.2.
- AC: On auto-close, the session is saved with an empty summary.
- AC: The summary can be added or edited later from the session history.

**US-5.4 Daily reset at local midnight.** As a user, I want each day to start at 0.
- AC: The day total resets at 00:00 in the user's timezone.
- AC: A session running across midnight is split automatically into two sessions with the same title and tag: one ending 23:59:59 on day 1, one starting 00:00:00 on day 2. The timer keeps running without any visible interruption; only the day total resets.
- AC: The split is performed by the backend (scheduled job per timezone) and also handled correctly if a device was offline at midnight.

**US-5.5 Session history.** As a user, I want to see, edit and correct my sessions.
- AC: A history list grouped by day shows start–end, duration, title, tag chip and summary.
- AC: The user can edit title, tag, summary, start time and end time of any finished session; overlapping sessions are rejected with a clear message.
- AC: The user can delete a session (with confirmation).
- AC: The user can manually add a past session (date, start, end, title, tag, summary).
- AC: Every edit, deletion or manual addition recalculates the affected day's totals, credits, goals and streaks.

**US-5.6 Cross-device control.** As a user, I want to pause on one device and see it paused everywhere (see section 9).

**Edge cases**

- If Start is pressed on two devices at nearly the same time, the server accepts the first event and the second device simply shows the running session.
- If the app is closed or the device is off, a running session keeps running on the server; there is no idle detection (explicit product decision).

## 6. Epic: Tags and categories

Users create any number of tags, and every tag belongs to exactly one of three fixed categories whose color is what the UI shows.

| Category | Color | Credit effect |
|---|---|---|
| Productive | Green | Earns credits |
| Leisure | Orange | Spends credits |
| Neutral | Blue | No effect |

**US-6.1 Starter tags.** On first login the user gets: Deep Work, Learning (Productive); Meeting, Admin, Break (Neutral); Gaming, Social Media (Leisure). They behave like any other tag.

**US-6.2 Create a tag.** As a user, I want to create tags from Settings and from the start/resume dialog.
- AC: Fields: name (required, unique per user, max 40 characters) and category (required).
- AC: A tag created from the dialog is selected immediately and the countdown stays cancelled.

**US-6.3 Rename and recategorize.** As a user, I want to rename a tag or move it to a different category.
- AC: Recategorizing changes the category for all past sessions with that tag, and stats, credits, goals and streaks are recalculated. The confirmation dialog states this.

**US-6.4 Archive.** As a user, I want to hide tags I no longer use without losing history.
- AC: Archived tags disappear from pickers but keep showing in history and stats. They can be unarchived.

**US-6.5 Delete with reassignment.** As a user, I want to delete a tag.
- AC: If the tag has no sessions, it is deleted directly after confirmation.
- AC: If it has sessions, the user must pick a replacement tag (any active or archived tag, or "Untagged"); all sessions are reassigned, then the tag is deleted and totals are recalculated.

UI rule: wherever a tag appears (pickers, chips, history, charts), it is rendered as its name on or next to the category color. The category name is shown only in Settings and in category-level stats.

## 7. Epic: Credit system

Productive time earns credits, leisure time and tracked gaming or social media spend them, the balance never resets and can go negative, and nothing is ever blocked.

**Proposed default rates (all configurable per user in Settings)**

| Activity | Rate | Meaning |
|---|---|---|
| Productive session time | +5 credits per hour | 2 h of work buys 1 h of gaming or 30 min of social media |
| Gaming (tracked or Gaming-class leisure tag) | −10 credits per hour | 10 credits = 1 h of gaming |
| Social media (tracked or Social-class leisure tag) | −20 credits per hour | 10 credits = 30 min of scrolling |
| Other leisure-tagged session time | −10 credits per hour | Default for leisure tags with no class |
| Neutral / untagged time | 0 | No effect |

Credits are computed per second and stored with 2 decimals; the UI shows whole credits plus the equivalent "≈ 1 h 20 m of gaming / ≈ 40 m of social media left".

```
balance = Σ productive hours × r_earn − Σ_c hours_c × r_c
```

**US-7.1 Earn credits.** As a user, I earn credits for every second of time in a Productive-tagged session.
- AC: Earning shows live on the main screen while a productive session runs.

**US-7.2 Spend credits.** As a user, my balance decreases while I'm in a Leisure-tagged session or while tracked Gaming/Social usage is detected (section 8).
- AC: Each Leisure tag may optionally be linked to a distraction class (Gaming or Social Media) so it uses that class's rate; otherwise it uses the "other leisure" rate.

**US-7.3 No double charging.** When tracked usage overlaps a Leisure-tagged session (e.g. a "Chill" session while scrolling Facebook), only the tracked usage is charged for the overlapping time, at its class rate. Leisure-session time with no detected usage is charged at the leisure rate.

**US-7.4 Negative balance.** The balance may go below zero; it is never blocked or clamped. Negative values are shown in red with a minus sign.

**US-7.5 Carry-over.** The balance never resets, so a user can save up during the week for a long gaming weekend.

**US-7.6 Credit ledger.** As a user, I want to see why my balance changed.
- AC: Every change is a ledger entry (date, source: session / tracked usage / manual edit recalculation, category or class, minutes, credits).
- AC: The balance is always derivable by replaying the ledger, so history edits and rate changes can recalculate it.
- AC: Rate changes apply from the moment they are saved; past entries keep the rate they were earned or spent at.

Open question (proposed default in brackets): if tracked Gaming/Social usage is detected while a Productive session is running, should that time stop earning? [Yes: the overlapping time earns nothing and is charged at the class rate.]

## 8. Epic: Activity tracking (Windows and Android)

The Windows and Android apps detect gaming and social media use in the background and report only daily totals per class to the server; v1 uses rules plus smart suggestions, and leisure-tagged sessions remain the manual fallback.

**US-8.1 Windows detection.** As a user, the desktop app detects when I'm gaming or on social media.
- AC: The app polls the foreground window every 5 s (process executable name + window title) and runs in the tray when its window is closed.
- AC: Social media in a browser is matched by window title and, where available, the browser's URL via UI Automation (Chrome, Edge, Firefox, Brave). Default domains: facebook.com, instagram.com, x.com/twitter.com, tiktok.com, reddit.com, youtube.com (Shorts only optional), linkedin.com feed is not included by default.
- AC: Games are matched by rule list first, then by smart signals (US-8.3).
- AC: Only time while the user is actually present counts: the screen locked or the computer asleep stops counting.

**US-8.2 Android detection.** As a user, the phone app detects gaming and social media apps and sites.
- AC: App usage via UsageStatsManager (Usage Access permission, requested with an explanation screen).
- AC: Apps whose system category is Game (ApplicationInfo.CATEGORY_GAME) are classified as Gaming automatically.
- AC: Social apps (Facebook, Instagram, TikTok, X, Reddit, Snapchat, Threads) are matched by package name from the default rule list.
- AC: Browser sites are detected through an optional Accessibility Service that reads only the address bar of known browsers; the user enables it explicitly. Without it, only apps are tracked.
- AC: A foreground service with a persistent notification keeps tracking alive (see US-12.6).

**US-8.3 Smart game detection (Windows).** As a user, I want games recognized without listing each one.
- AC: Signals, any of which proposes "Gaming": executable located under a known game library folder (Steam steamapps\common, Epic, GOG, Xbox/WindowsApps games, Battle.net, EA, Ubisoft); process launched by a known launcher; full-screen or borderless window with sustained high GPU usage.
- AC: Signals produce a suggestion, not a silent rule: a notification "Is ‹app› a game? Yes / No / Neutral". The answer becomes a usage rule. Until answered, the time counts as Gaming if any library-folder signal matched, otherwise it is not charged.

**US-8.4 Usage rules in Settings.** As a user, I want to see and edit what counts as gaming or social media.
- AC: A list of rules (app or domain → Gaming / Social Media / Ignore) with the shipped defaults, user additions, and a toggle per rule.
- AC: A "Recently seen apps" list (from the device only, last 7 days) lets the user classify an app in one tap.

**US-8.5 Privacy: only totals leave the device.** The server stores only per-day, per-class totals (Gaming minutes, Social Media minutes) per device.
- AC: The device keeps raw foreground samples locally for at most 7 days (for the Recently seen apps list) and never uploads them.
- AC: The device sends incremental totals every 60 s while tracked usage is happening, flagged as overlapping a leisure session or not (for US-7.3), so credits and notifications update in near real time.
- AC: If offline, increments queue locally and sync later.

**US-8.6 Tracking toggle.** As a user, I can pause or disable tracking per device from Settings; the app clearly shows when tracking is active.

Fallback: if detection is unreliable for a case, the user starts a leisure-tagged session (e.g. "Gaming") and is charged through the timer instead.

## 9. Epic: Real-time sync and offline

The backend is the single source of truth, every state change is pushed to all of the user's connected devices over a persistent socket, and devices work offline with a queue that replays on reconnect.

**US-9.1 Live sync.** As a user, when I pause on desktop, my phone shows paused within about 1 second, and vice versa.
- AC: Each device keeps an authenticated WebSocket connection (one room per user) and reconnects automatically with backoff.
- AC: Events broadcast: timer started/resumed, paused, session title/tag/summary changed, midnight split, session edited/deleted/added, tag changes, settings changes, credit balance changes, goal reached.
- AC: An open start/pause dialog on another device closes when the session state changes elsewhere.
- AC: On (re)connect, the device fetches a full state snapshot (running session, today's totals, balance) before applying live events.

**US-9.2 Offline use.** As a user without internet, I can still start and pause the timer.
- AC: Actions are applied locally at once and stored in an outbox with the device timestamp and a unique event id (idempotent replay).
- AC: On reconnect the outbox is sent in order; the server resolves conflicts by latest action wins using event timestamps corrected by the device's measured clock offset to the server.
- AC: A small "Offline – will sync" indicator is shown while the outbox is not empty.

**US-9.3 Clock safety.** Displayed times are computed from server timestamps plus the device's clock offset, so a wrong device clock doesn't change the totals.

## 10. Epic: Goals, streaks and notifications

Goals and streaks measure productive hours only, and notifications warn about credits and celebrate goals without ever blocking anything.

**US-10.1 Set goals.** As a user, I can optionally set a daily, weekly and monthly productive-hours goal, each independent and each can be left unset.
- AC: Week start day is a setting (default Monday). Month = calendar month in the user's timezone.
- AC: Progress bars on the main screen (daily) and the stats page (all three) show productive hours vs goal.

**US-10.2 Streaks.** As a user, I want to see how many days in a row I hit my daily goal.
- AC: Current streak and best streak are shown on the main screen and stats page.
- AC: Streaks require a daily goal; with no daily goal, streaks are hidden.
- AC: Setting: "Count weekends" (default on). When off, Saturdays and Sundays neither break nor extend the streak.
- AC: Editing history recalculates streaks.

**US-10.3 Notifications.** As a user, I get native notifications (Windows toast; Android push via FCM and local notifications) for:

| Trigger | Default |
|---|---|
| Credit balance low: ≤ 10 minutes of the currently used class left | On |
| Credit balance reaches 0 | On |
| Balance keeps dropping below 0: reminder every 15 min of further tracked usage | On |
| Daily goal reached | On |
| Weekly and monthly goal reached | On |
| Smart game suggestion (US-8.3) | On |

- AC: Each notification type has its own toggle in Settings.
- AC: A notification is shown on the device where the usage happens; goal notifications go to all devices once (deduplicated by the server).
- AC: No "start your timer" reminder (explicit product decision).

## 11. Epic: Stats and reports

The stats page counts all tracked time but leads with productive hours, with day, week and month views, breakdowns, goals, credits and a session list.

**US-11.1 Period views.** As a user, I can switch between Day, Week and Month and step backward/forward through periods.
- AC: Headline numbers in this order: productive hours (largest), total hours, productive share (%), goal progress.
- AC: Day view: timeline of sessions across 24 h colored by category.
- AC: Week and month views: bar chart per day, stacked by category (Productive green, Leisure orange, Neutral blue), with the daily goal as a reference line.

**US-11.2 Breakdowns.** As a user, I can see time per category and per tag for the selected period, plus tracked Gaming and Social Media minutes (from section 8).

**US-11.3 Goal and streak history.** As a user, I see which days hit the daily goal (calendar heatmap in month view), plus current and best streak.

**US-11.4 Credit history.** As a user, I see a balance-over-time line and the ledger (US-7.6) for the period.

**US-11.5 Session list.** As a user, I see every session of the period with title, tag, duration and summary, filterable by tag and category and searchable by title/summary text. Each row opens the edit view (US-5.5).

**US-11.6 CSV export.** As a user, I can export the selected period as CSV.
- AC: Sessions file columns: date, start, end, duration_minutes, title, tag, category, summary.
- AC: Daily summary file columns: date, productive_minutes, leisure_minutes, neutral_minutes, gaming_minutes, social_minutes, credits_earned, credits_spent, balance_end_of_day, daily_goal_met.

Performance: stats for any month load in under 500 ms; the backend keeps per-day aggregate rows updated on every session change rather than scanning sessions on each request.

## 12. Epic: Settings and platform features

Settings are synced per account (except device-only items marked device), and each app adds the native conveniences people expect on its platform.

**US-12.1 Settings page sections**
- Account: email, password, Google link status, signed-in devices, export data, delete account.
- Time: timezone, week start day.
- Tags: create, rename, recategorize, archive, delete with reassignment, link leisure tag to Gaming/Social class.
- Goals: daily, weekly, monthly productive hours; count weekends for streaks.
- Credits: earn rate, gaming rate, social rate, other-leisure rate; balance and ledger link.
- Tracking (device): on/off, usage rules, recently seen apps, Android permissions status (Usage Access, Accessibility, notifications, battery optimization).
- Notifications: one toggle per type (US-10.3).
- Appearance: light / dark / system theme.
- Desktop (device): launch at startup, global shortcut, mini widget.

**Desktop app (Windows)**

**US-12.2 Tray icon:** shows running/paused state; menu with Start/Resume, Pause, current timers, Open, Quit. Closing the window minimizes to tray.

**US-12.3 Launch at startup:** toggle, default on.

**US-12.4 Global shortcut:** configurable, default Ctrl+Alt+Space toggles start/pause (opens the corresponding dialog).

**US-12.5 Mini floating widget:** optional always-on-top compact window with the two timers and a start/pause button.

Installer: signed if a certificate is available; auto-update from the server or GitHub releases.

**Mobile app (Android, sideloaded APK)**

**US-12.6 Persistent notification:** while a session runs, shows title, tag color, session timer and day total with Pause/Resume buttons. It doubles as the foreground service for tracking.

**US-12.7 Home-screen widget:** shows day total, current session timer, credit balance and a start/pause button; updates on state change.

**US-12.8 Onboarding for permissions:** explains and requests notification, Usage Access, optional Accessibility, and battery-optimization exemption, each skippable.

Update check: the app checks a version endpoint on the backend and offers to download the new APK.

## 13. Non-functional requirements, scope and phases

**Non-functional requirements**

- Performance: start/pause reflected in the UI in under 100 ms (optimistic), on other devices in about 1 s; app cold start under 2 s.
- Security: passwords hashed with argon2 or bcrypt; HTTPS/WSS in production; rate limits on auth endpoints; every query scoped to the authenticated user.
- Data integrity: all times stored in UTC; all day boundaries computed in the user's timezone; credit and stats aggregates are recomputable from sessions, usage totals and the ledger.
- Testing: unit tests for the shared rules (midnight split, credit math including overlap, streaks, recalculation after edits); integration tests for auth, timer events and sync conflict resolution.
- Observability: structured logs from the backend; /health endpoint.

**Out of scope for v1**

- iOS app, web app, macOS/Linux desktop, Play Store publishing.
- Admin panel, teams or shared workspaces.
- Blocking apps or sites (the product only notifies).
- Idle detection and "start your timer" reminders.
- Uploading raw activity logs.

**Delivery phases (build in this order)**

1. Foundation: monorepo, Docker Compose with hybrid DATABASE_URL, auth (email + verification, reset, Google), account deletion.
2. Core timer: sessions, start/pause dialogs with countdowns, two timers, midnight split, history editing.
3. Real-time sync and offline queue across desktop and mobile.
4. Tags and categories, goals, streaks, stats page, CSV export.
5. Credits: rates, ledger, leisure-session spending, notifications.
6. Activity tracking: Windows and Android rule-based detection, usage rules settings, overlap handling.
7. Smart game detection suggestions, tray, global shortcut, mini widget, Android home-screen widget, auto-update.

**Open questions**

- Confirm the default credit rates in section 7.
- Confirm whether tracked distraction during a Productive session stops earning (section 7, proposed: yes).
