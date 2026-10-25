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
