//! UniFFI bridge of `pulse-core` for the Android app (docs/ARCHITECTURE.md sections 1-3). The
//! Kotlin side calls only what is exported here: a small, plain-data surface (strings, integers,
//! one error enum, one handle object); everything else stays in `pulse-core`.
//!
//! T0.7 spike scope: the handle, the core version and one time-math call prove the library
//! loads, runs under the foreground service and reports typed errors. The real API (commands,
//! queries, state streams) arrives with T1.12 and T3.7.

// The UniFFI scaffolding macros expand to `extern "C"` items with `#[unsafe(no_mangle)]` and
// pointer handling; that code is generated and audited upstream, and nothing hand-written in this
// crate uses `unsafe`.
#![allow(
    unsafe_code,
    reason = "uniffi::setup_scaffolding! and the uniffi derives expand to FFI items"
)]

use std::sync::Arc;

use jiff::Timestamp;
use pulse_core::adapters::SystemClock;
use pulse_core::domain::time::{TimeError, day_key, time_zone};
use pulse_core::ports::Clock;

uniffi::setup_scaffolding!();

/// Why a call into the core failed, as typed values Kotlin can `when` over (rule: nothing
/// panics across the boundary, errors cross as data).
#[derive(Debug, PartialEq, Eq, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    /// The IANA zone name is not in the bundled time-zone database.
    #[error("unknown IANA time zone {name:?}")]
    UnknownTimeZone { name: String },
    /// The instant is outside the range time math supports (years -9999 to 9999).
    #[error("time outside the supported range")]
    OutOfRange,
}

impl From<TimeError> for CoreError {
    fn from(error: TimeError) -> Self {
        match error {
            TimeError::UnknownTimeZone { name } => CoreError::UnknownTimeZone { name },
            // Malformed day and instant text cannot come out of the calls exported here (they
            // take integers and a zone name); if one is exported later it gets its own variant.
            TimeError::MalformedDay { .. }
            | TimeError::MalformedInstant { .. }
            | TimeError::OutOfRange(_) => CoreError::OutOfRange,
        }
    }
}

/// The version of `pulse-core` this library was built from (`major.minor.patch`).
#[uniffi::export]
#[must_use]
pub fn core_version() -> String {
    pulse_core::api::version().to_owned()
}

/// The local day (`YYYY-MM-DD`, R-10) of an instant in an IANA zone, from the core's time math
/// and its bundled time-zone database (ADR-0004).
///
/// # Errors
/// `UnknownTimeZone` for a zone name outside the database, `OutOfRange` for an instant outside
/// years -9999 to 9999.
#[uniffi::export]
pub fn local_day(epoch_seconds: i64, zone: String) -> Result<String, CoreError> {
    let zone = time_zone(&zone)?;
    let instant = Timestamp::from_second(epoch_seconds).map_err(|_| CoreError::OutOfRange)?;
    Ok(day_key(instant, &zone).to_string())
}

/// A running core. The foreground service creates one when it starts and drops it when it stops;
/// the UI reaches the core only through that service (ARCHITECTURE section 2).
#[derive(uniffi::Object)]
pub struct PulseCore {
    clock: SystemClock,
}

#[uniffi::export]
impl PulseCore {
    /// Starts the core. Spike scope: only the system clock; storage, sync and tracking arrive
    /// with their tasks.
    #[uniffi::constructor]
    #[must_use]
    pub fn new() -> Arc<Self> {
        Arc::new(Self { clock: SystemClock })
    }

    /// The device clock in whole epoch seconds, read through the core's `Clock` port.
    #[must_use]
    pub fn now_epoch_seconds(&self) -> i64 {
        self.clock.now().as_second()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_version_is_the_core_crates_version() {
        assert_eq!(core_version(), pulse_core::api::version());
    }

    #[test]
    fn local_day_uses_the_given_zone_not_utc() {
        // 2026-03-01T20:00:00Z is already 02:00 on 2026-03-02 in Dhaka (UTC+6).
        let instant = 1_772_395_200;

        assert_eq!(
            local_day(instant, "UTC".into()).as_deref(),
            Ok("2026-03-01")
        );
        assert_eq!(
            local_day(instant, "Asia/Dhaka".into()).as_deref(),
            Ok("2026-03-02")
        );
    }

    #[test]
    fn local_day_reports_an_unknown_zone_as_a_typed_error() {
        let result = local_day(0, "Mars/Olympus".into());

        assert!(
            matches!(&result, Err(CoreError::UnknownTimeZone { name }) if name == "Mars/Olympus"),
            "{result:?}"
        );
    }

    #[test]
    fn local_day_rejects_an_instant_outside_the_supported_range() {
        assert!(matches!(
            local_day(i64::MAX, "UTC".into()),
            Err(CoreError::OutOfRange)
        ));
    }

    #[test]
    fn a_started_core_reads_the_system_clock() {
        let core = PulseCore::new();

        // 2026-01-01T00:00:00Z: any real clock is past it.
        assert!(core.now_epoch_seconds() > 1_767_225_600);
    }
}
