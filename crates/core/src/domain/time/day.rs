//! Days (R-10): `YYYY-MM-DD` keys, time-zone lookup, and the half-open bounds of a local day.

use std::fmt;
use std::str::FromStr;

use jiff::civil::Date;
use jiff::tz::{AmbiguousOffset, TimeZone, TimeZoneDatabase};
use jiff::{SignedDuration, Timestamp};

use super::TimeError;
use super::instant::floor;
use super::text::calendar_date;

/// A local calendar day, `YYYY-MM-DD` (R-10). Parsing accepts exactly that form, nothing looser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct DayKey(Date);

impl DayKey {
    #[must_use]
    pub fn date(self) -> Date {
        self.0
    }

    pub(super) fn next(self) -> Result<DayKey, TimeError> {
        self.0.tomorrow().map(DayKey).map_err(TimeError::OutOfRange)
    }
}

impl From<Date> for DayKey {
    fn from(date: Date) -> Self {
        DayKey(date)
    }
}

impl FromStr for DayKey {
    type Err = TimeError;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        calendar_date(text.as_bytes())
            .map(DayKey)
            .ok_or_else(|| TimeError::MalformedDay {
                value: text.to_owned(),
            })
    }
}

impl fmt::Display for DayKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let date = self.0;
        write!(
            f,
            "{:04}-{:02}-{:02}",
            date.year(),
            date.month(),
            date.day()
        )
    }
}

/// Looks up an IANA zone (case-insensitively) in the database bundled into the binary. The
/// bundled copy is named explicitly, not `jiff::tz::db()`, so the answer never depends on the OS
/// database or the `TZDIR` variable (ADR-0004: Windows and Android give the same answers).
pub fn time_zone(name: &str) -> Result<TimeZone, TimeError> {
    TimeZoneDatabase::bundled()
        .get(name)
        .map_err(|_| TimeError::UnknownTimeZone {
            name: name.to_owned(),
        })
}

/// The local day of `instant` in `zone`.
#[must_use]
pub fn day_key(instant: Timestamp, zone: &TimeZone) -> DayKey {
    // Flooring is unnecessary here: offsets are whole seconds, so local midnights fall on whole
    // seconds and dropping the fraction never moves an instant across one.
    DayKey(zone.to_datetime(instant).date())
}

/// The half-open interval `[start, end)` of a local day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DayBounds {
    pub start: Timestamp,
    pub end: Timestamp,
}

impl DayBounds {
    /// The day's length: 82 800 or 90 000 on DST days, 0 for a day a zone skipped entirely.
    #[must_use]
    pub fn seconds(&self) -> i64 {
        self.end.as_second() - self.start.as_second()
    }
}

/// R-10, R-11: a day runs from its start to the start of the next day.
pub fn day_bounds(day: DayKey, zone: &TimeZone) -> Result<DayBounds, TimeError> {
    Ok(DayBounds {
        start: start_of_day(day, zone)?,
        end: start_of_day(day.next()?, zone)?,
    })
}

/// The first instant whose local date is `day` (ADR-0004): local midnight; the earlier one if
/// midnight repeats; the end of the gap if midnight is skipped (01:00 in America/Santiago on
/// 2026-09-06). This is Temporal's `startOfDay`. jiff's own `start_of_day` uses the `compatible`
/// rule, which agrees only when the gap starts exactly at midnight, so the gap is resolved here
/// from the zone's transition instead.
pub(super) fn start_of_day(day: DayKey, zone: &TimeZone) -> Result<Timestamp, TimeError> {
    let midnight = day.0.to_datetime(jiff::civil::Time::midnight());
    let start = match zone.to_ambiguous_timestamp(midnight).offset() {
        AmbiguousOffset::Unambiguous { offset } => offset.to_timestamp(midnight),
        AmbiguousOffset::Fold { before, .. } => before.to_timestamp(midnight),
        AmbiguousOffset::Gap { before, .. } => {
            // Midnight read with the pre-gap offset lands at or after the transition, and the
            // transition is the first instant after the gap.
            let after_gap = before
                .to_timestamp(midnight)
                .map_err(TimeError::OutOfRange)?;
            let probe = after_gap
                .checked_add(SignedDuration::from_secs(1))
                .map_err(TimeError::OutOfRange)?;
            Ok(zone
                .preceding(probe)
                .next()
                .map_or(after_gap, |transition| transition.timestamp()))
        }
    }
    .map_err(TimeError::OutOfRange)?;
    floor(start)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(text: &str) -> DayKey {
        text.parse().unwrap_or_else(|error| panic!("{error}"))
    }

    #[test]
    fn day_keys_accept_only_strict_calendar_dates() {
        for text in [
            "",
            "2026-1-05",
            "2026-01-5",
            "20260105",
            "2026/01/05",
            "2026-02-29",
            "2026-13-01",
            "2026-00-10",
            "2026-01-00",
            "2026-10-25T00:00",
            " 2026-10-25",
            "+2026-10-25",
            "２０２６-10-25",
        ] {
            assert!(
                matches!(text.parse::<DayKey>(), Err(TimeError::MalformedDay { value }) if value == text),
                "{text:?} was accepted"
            );
        }
    }

    #[test]
    fn day_keys_print_as_they_parse() {
        for text in ["2026-10-25", "2028-02-29", "0001-01-01", "9999-12-31"] {
            assert_eq!(key(text).to_string(), text);
        }
    }

    #[test]
    fn unknown_zones_are_an_error_not_utc() {
        for name in ["", "Mars/Olympus_Mons", "America/Los Angeles", "+06:00"] {
            assert!(
                matches!(time_zone(name), Err(TimeError::UnknownTimeZone { name: found }) if found == name),
                "{name:?} was accepted"
            );
        }
    }

    #[test]
    fn zone_lookup_ignores_case() {
        assert!(time_zone("asia/dhaka").is_ok());
    }

    #[test]
    fn the_last_representable_day_has_no_end() {
        let utc = TimeZone::UTC;
        assert!(matches!(
            day_bounds(key("9999-12-31"), &utc),
            Err(TimeError::OutOfRange(_))
        ));
    }

    #[test]
    fn a_gap_that_starts_before_midnight_starts_the_day_at_the_transition() {
        // Clocks jump from 23:30 to 00:30 on 2026-03-29 (last Sunday of March, 23:30 local), so
        // 2026-03-30 begins at 00:30 local, the transition instant 2026-03-29T23:30Z. The
        // `compatible` rule would give 01:00 local (00:00Z) instead.
        let zone = TimeZone::posix("XST0XDT-1,M3.5.0/23:30,M10.5.0/23:30")
            .unwrap_or_else(|error| panic!("{error}"));
        let bounds = day_bounds(key("2026-03-30"), &zone).unwrap_or_else(|error| panic!("{error}"));
        assert_eq!(bounds.start.to_string(), "2026-03-29T23:30:00Z");
        assert_eq!(
            zone.to_datetime(bounds.start).to_string(),
            "2026-03-30T00:30:00"
        );
        assert_eq!(bounds.seconds(), 86_400 - 1_800);
    }

    #[test]
    fn a_skipped_day_has_zero_length() {
        // Samoa skipped 2011-12-30 when it crossed the date line.
        let apia = time_zone("Pacific/Apia").unwrap_or_else(|error| panic!("{error}"));
        let bounds = day_bounds(key("2011-12-30"), &apia).unwrap_or_else(|error| panic!("{error}"));
        assert_eq!(bounds.seconds(), 0);
        assert_eq!(bounds.start.to_string(), "2011-12-30T10:00:00Z");
    }
}
