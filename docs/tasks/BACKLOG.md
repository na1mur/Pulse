# Backlog

Medium and Low findings and out-of-scope observations from task delivery (D-33). One line each: `task | severity | finding`. Remove a line when it is fixed or dropped. The M0 deferred lists in `LEDGER.md` stay where they are.

T0.7 | high | DESK-02 (tray): close must destroy the WebView2 window and keep the process alive (`RunEvent::ExitRequested` + `prevent_exit`); hiding costs about 76 MB and breaks the 50 MB budget (spec 9.3)
T0.7 | medium | Measure Android cold start and idle service memory on a real arm64 phone before the first release (spec 9.3); the emulator figures are x86_64 only
T0.7 | medium | Set `versionCode` above the legacy app's (MOB-05); `assembleRelease` yields an unsigned APK, signing is T0.x release work
T0.7 | medium | Replace spike stand-ins: lazy FCM init only when push config exists (D-23); service started by MOB-02's trigger, not by `MainActivity`
T0.7 | low | `FirebaseMessagingService.onNewToken` deprecation suppressed with a comment; revisit in NOTIF-04
T0.7 | low | Gradle assumes the Cargo target dir is `<repo>/target` unless `CARGO_TARGET_DIR` is set
T0.7 | low | Re-measure desktop memory and cold start with the real core and tray; measurement scripts live only in the scratchpad, add `scripts/measure-desktop.*` if release verification needs them
T0.7 | medium | Decide the rustls crypto provider (aws-lc-rs +1.55 MB vs ring) when the first sync client lands; the spike links no network code
T1.1 | low | `user_revisions` can be lowered by delete and reinsert (the trigger guards UPDATE only); services never delete the row, T1.x revision service should own it
T1.1 | low | The database does not check email whitespace, IANA timezone names, credential `expires_at > issued_at` or tag `name_key` against `name`; the services (T1.4, T2.x, TAG tasks) must validate them
T1.1 | low | Seed order: `pnpm dev` seeds before the server migrates; the first seed file that writes to a table needs a migrate step in `pnpm dev` (see DEVELOPMENT.md)
T1.1 | low | One vitest worker exit (code 3221226505) and one unreproduced `tests` failure seen once each; watch CI, capture the log if it recurs (timeouts raised to 20 s / 30 s)
T1.1 | low | Email token 24 h / 1 h expiry is not enforced in the database; T1.3/T1.4 service owns it
T1.1 | low | `emailKey()` lower-cases rather than case-folds (`ΑΣ`/`ασ`, `STRASSE`/`STRAßE`, Turkish İ stay separate accounts); trim runs before NFKC and U+200B is not trimmed: T1.4 email validation should reject such input
T1.1 | low | The checksum-guard message for a database that ran an older 0001 says "add a new migration"; dev databases need `pnpm dev:reset`
T1.1 | medium | Intermittent vitest worker crash (0xC0000409, about 3 in 20 full runs on this Windows machine) in the HTTP specs, not tied to T1.1; a crashed worker leaves a `pulse_test_*` database behind. Capture the log if it recurs in CI
T1.1 | medium | Decide before T1.4: `devices.id` is globally unique (primary key); a second user signing in on an install that another user used collides. Reassign or delete the old device row on sign-out, or generate a fresh device ID per sign-in
T1.1 | low | `user_revisions` is not created with the user and only `tags` / `user_preferences` carry a revision column; the revision service (first write task) must create the row and bump it in every change transaction (R-35)
T1.1 | low | `email_key` is not derived or checked by the database (application-folded, `emailKey()`); every user insert and lookup must go through it. A tag `name_key` rule needs the same single helper when the tag service lands
T1.1 | low | Notification toggles default to on (spec silent): confirm with the owner when NOTIF-03 lands
T1.1 | low | Cleanups: `Nullable<T>` alias in `database.types.ts`; `DATABASE_URL` read in `bootstrap.ts` and `database.module.ts` (T1.2 config replaces both); two near-identical connection-failure formatters (`connection-failure.ts`, `test-database.testing.ts`); `.testing.ts` suffix convention undocumented; `migrator.ts` `steps` option and `createUnconfiguredDatabase` are used by tests only; the spec files `schema.spec.ts` (704 lines), `qa-adversarial.spec.ts` (972), `qa-round2.spec.ts` (270) overlap, are past the 300-line guideline and are named after their author and round; unused `expires_at` indexes; `postgres:17-alpine` is a floating tag in ci.yml
