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
T1.1 | low | `user_revisions` is not created with the user and only `tags` / `user_preferences` carry a revision column; the revision service (first write task) must create the row and bump it in every change transaction (R-35)
T1.1 | low | `email_key` is not derived or checked by the database (application-folded, `emailKey()`); every user insert and lookup must go through it. A tag `name_key` rule needs the same single helper when the tag service lands
T1.1 | low | Notification toggles default to on (spec silent): confirm with the owner when NOTIF-03 lands
T1.1 | low | Cleanups: `Nullable<T>` alias in `database.types.ts`; two near-identical connection-failure formatters (`connection-failure.ts`, `test-database.testing.ts`); `migrator.ts` `steps` option is used by tests only; the spec files `schema.spec.ts` (704 lines), `qa-adversarial.spec.ts` (972), `qa-round2.spec.ts` (270) overlap, are past the 300-line guideline and are named after their author and round; unused `expires_at` indexes; `postgres:17-alpine` is a floating tag in ci.yml
T1.2 | medium | Windows vitest worker start-up crash (exit 3221226505) about once in 8 full runs; load-related, reproduced on HEAD. If CI shows it, add a retry or lower the worker count
T1.2 | low | `PUBLIC_API_URL` defaults to `http://localhost:PORT`: make it required in the deployment (T1.3); Appendix A could list the fixed timeouts (30 s request, 15 s statement, 5 s connect, 2 s health, 8 s shutdown grace)
T1.2 | medium | Appendix A says `DATABASE_URL` empty = bundled database, but the server now requires it: T1.3's Compose file must inject the bundled database URL, and Appendix A should say so
T1.2 | low | A request timeout answers 503 but the handler keeps running (a write may still commit); acceptable because commands are idempotent (documented), revisit if long handlers appear
T1.3 | low | The server exits 143 after a graceful SIGTERM stop (Nest re-raises the signal); harmless in Docker, exit 0 would be tidier
T1.3 | low | Base images are pinned by tag, not digest; consider digests plus Renovate/Dependabot when releases start
T1.3 | medium | First CI run of the `deploy` job: Docker Hub rate limits and Compose >= 2.24 on the runner are unverified
T1.3 | low | With an external `DATABASE_URL`, the owner must also drop `db` from `COMPOSE_PROFILES` (Compose cannot switch a profile on a variable); documented in the README and env template, but the spec's wording "DATABASE_URL switch" (OPS-01) could say so
T1.3 | low | The template's `PUBLIC_API_URL` defaults to `http://localhost:3000`; a forgotten edit under the `https` profile gives wrong email links (consider an empty default so the `:?` check catches it, once the owner updates `.env.example`)
T1.3 | low | Compose runs only from `infra/` (no root compose file); README clone URL is hard-coded to the GitHub repository (fails if it is private)
T1.4 | low | Add the email-change token lifetime (24 h) to Appendix A and the EmailToken row when T1.7 settles it
T1.5 | low | First sign-in completed later from another device returns the 7 starter tags in arbitrary order instead of the TAG-07 order
T1.5 | low | A device that loses a refresh response and retries with the old token is signed out (reuse detection as specified); decide on purpose before the Android client (T1.8 single-flight refresh)
T1.5 | low | Anyone who learns another user's device ID can sign that device out by signing in to their own account with it (follows the T1.1/T1.5 device-reuse decision)
T1.5 | low | Password length counts UTF-16 units (four emoji pass as 8 characters) and passwords are not Unicode-normalised; settle with AUTH-06/T1.7
T1.5 | low | Register's 200 ms response floor holds here; under load the new-address path would exceed it first (timing enumeration); revisit in T1.13
T1.5 | low | Once tag creation exists (T2.x), a user tag with a starter-tag name would make first sign-in setup fail every time
T1.5 | medium | Rate limiter fails closed when a rule's table (10,000 windows) is full of blocking windows: about 100,000 hashed login attempts from 3,334+ IPv6 /64s can refuse sign-in to accounts not yet in the table for up to 15 min; resend for new addresses can be held at 429 for a minute cheaply. Same setup also lets an account one guess short of its limit be evicted for 9 fresh guesses per extra request (QA R2-1). Revisit in T1.13 (capacity, per-prefix aggregation)
T1.5 | low | `auth.refresh` and `auth.verifyEmail` are rate limited per IP only (spec 9.1 says per IP and per account); tokens are 256-bit so guessing is not the risk; decide in T1.13 whether a per-family / per-token limit is wanted
T1.5 | low | dependency-cruiser `server-transport-no-database` covers `*.controller.ts` and `*.gateway.ts` but not `*.guard.ts` (how the AuthGuard-calls-a-repository breach slipped past tooling); add `guard` to the pattern and a case to its rule test
