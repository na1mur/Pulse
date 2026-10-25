//! Time math (R-10..R-18, ADR-0004): the only place that turns instants into day keys, day and
//! period bounds, per-day history rows and period totals. Pure: `now` is always an argument.
//!
//! Conventions, identical to the server's `apps/server/src/domain/time/` through the shared
//! fixtures (D-19, `packages/contract/fixtures/time/`):
//! - every instant is floored to whole seconds before any arithmetic (R-16);
//! - intervals are half-open, `[start, end)`;
//! - a day starts at its first instant with that local date (01:00 on a skipped midnight) and ends
//!   where the next day starts, so DST days last 23 h or 25 h;
//! - time zones come from the IANA database bundled into the binary, never the OS copy.

mod day;
mod display;
mod instant;
mod period;
mod rows;
mod text;

pub use day::{DayBounds, DayKey, day_bounds, day_key, time_zone};
pub use display::{SummaryParts, format_clock, summary_parts};
pub use instant::{duration_seconds, format_instant, parse_instant, whole_seconds};
pub use period::{Period, PeriodId, PeriodKind, period, period_id};
pub use rows::{DayRow, SessionSpan, day_rows, period_total};

/// Why time math rejected its input. Unknown zones and malformed text come from outside (the
/// wire, the store); `OutOfRange` only from dates near jiff's limits (years -9999 and 9999).
#[derive(Debug, thiserror::Error)]
pub enum TimeError {
    #[error("unknown IANA time zone {name:?}")]
    UnknownTimeZone { name: String },
    #[error("malformed day {value:?}: expected a calendar date YYYY-MM-DD")]
    MalformedDay { value: String },
    #[error("malformed instant {value:?}: expected an ISO-8601 UTC instant ending in Z")]
    MalformedInstant { value: String },
    #[error("time outside the supported range")]
    OutOfRange(#[source] jiff::Error),
}
