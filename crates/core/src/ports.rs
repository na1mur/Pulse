//! The traits through which every side effect enters the core: clock, store, transport,
//! connectivity, notifier, foreground source and presence. Platform code implements them; tests
//! use fakes.
//!
//! Depends on `domain` types only.

use jiff::Timestamp;

/// The only way the core reads the time (ADR-0004 "Clock"): `SystemClock` in production, a
/// `FakeClock` (feature `test-support`) in tests. Domain functions never call it; `app` and up
/// read it once and pass `now` down.
pub trait Clock: Send + Sync {
    /// The current instant, at full precision; time math floors it to whole seconds.
    fn now(&self) -> Timestamp;
}
