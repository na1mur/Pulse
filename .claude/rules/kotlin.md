---
paths:
  - "apps/android/**"
---

# Kotlin / Compose Android app

Use `mobile-android-design` (Material 3, Compose) and `.claude/references/ux/android.md`; **the FE guide (`docs/FE_GUIDE.md`) wins** on design and behaviour. Structure: `docs/ARCHITECTURE.md` section 3.

- Business logic lives in the Rust core; Kotlin owns UI, the foreground service, trackers and platform glue. Do not reimplement time, sync or credit math in Kotlin.
- UI: Compose with the generated theme from `packages/tokens`; Material color roles, `sp` for text, 48 dp touch targets, edge-to-edge insets; no hard-coded colours or dimensions in screens.
- Before building or changing UI, read the FE guide sections for the components and patterns involved and reuse an existing pattern when one fits. A design or flow question the guide does not answer: run the `design-decision` skill.
- State: one ViewModel per screen exposing immutable UI state (`StateFlow`); events in, state out. Coroutines with structured concurrency; no `GlobalScope`.
- Null safety: no `!!` without a comment saying why it is safe. Prefer sealed types for UI state and results.
- The foreground service (MOB-02) is the only long-lived component. It declares the `specialUse` foreground-service type (Android 14+ requires a type; `dataSync` is capped at 6 h on Android 15; fine for a sideloaded app) and never wakes the device while the screen is off (spec 9.3).
- Activity data: only package names or domains leave the device (principle 11).
- Tests: unit tests for ViewModels with fakes; Compose UI tests with `Modifier.testTag`; device flows in Maestro.
- Size: no dependency without a reason (APK budget, spec 9.3); no DI framework (spec section 11).
