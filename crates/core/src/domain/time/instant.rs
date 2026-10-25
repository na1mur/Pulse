//! Instants as whole seconds since the Unix epoch (R-16, ADR-0004 "Whole seconds").

use jiff::Timestamp;
use jiff::civil::Date;

use super::TimeError;
use super::text::{ascii_number, calendar_date};

/// Seconds since the Unix epoch, floored toward the past: `1969-12-31T23:59:59.500Z` is `-1`.
#[must_use]
pub fn whole_seconds(instant: Timestamp) -> i64 {
    let seconds = instant.as_second();
    // jiff keeps seconds and nanoseconds with the same sign, so a negative fraction means
    // `as_second` truncated toward zero, one second later than the floor.
    if instant.subsec_nanosecond() < 0 {
        seconds - 1
    } else {
        seconds
    }
}

/// The instant floored to its whole second.
pub(super) fn floor(instant: Timestamp) -> Result<Timestamp, TimeError> {
    Timestamp::from_second(whole_seconds(instant)).map_err(TimeError::OutOfRange)
}

/// Parses a contract `Instant` (spec 7.1) into floored epoch seconds. Accepts exactly the shape
/// the server's `parseInstant` accepts (`apps/server/src/domain/time/instant.ts`):
/// `YYYY-MM-DDTHH:MM:SS`, an optional `.` with any number of digits, then `Z`. Nothing looser
/// (no offsets, spaces, lowercase, missing seconds, leap seconds, comma fractions, basic format
/// or expanded years), so the core never stores an instant the server rejects (D-19).
pub fn parse_instant(iso: &str) -> Result<i64, TimeError> {
    let malformed = || TimeError::MalformedInstant {
        value: iso.to_owned(),
    };
    let (date, second_of_day) = utc_instant_parts(iso.as_bytes()).ok_or_else(malformed)?;
    // The fraction is never negative, so dropping it floors, before 1970 too. Computed without
    // jiff's `Timestamp` so the whole contract range up to 9999-12-31T23:59:59Z parses, as on the
    // server (jiff's instants end 26 hours earlier).
    let days = days_since_epoch(
        i64::from(date.year()),
        i64::from(date.month()),
        i64::from(date.day()),
    );
    Ok(days * 86_400 + second_of_day)
}

/// The date and second of the day of `YYYY-MM-DDTHH:MM:SS(.d+)?Z` (the server's regex), with
/// every field in range and the date one that exists; the fraction is checked, then dropped.
fn utc_instant_parts(bytes: &[u8]) -> Option<(Date, i64)> {
    let date = calendar_date(bytes.get(..10)?)?;
    let [b'T', h1, h2, b':', m1, m2, b':', s1, s2] = *bytes.get(10..19)? else {
        return None;
    };
    let fraction_ok = match bytes.get(19..)? {
        [b'Z'] => true,
        [b'.', digits @ .., b'Z'] => !digits.is_empty() && digits.iter().all(u8::is_ascii_digit),
        _ => false,
    };
    let (hour, minute, second) = (
        ascii_number(&[h1, h2])?,
        ascii_number(&[m1, m2])?,
        ascii_number(&[s1, s2])?,
    );
    let in_range = fraction_ok && hour <= 23 && minute <= 59 && second <= 59;
    in_range.then(|| {
        (
            date,
            i64::from(hour) * 3600 + i64::from(minute) * 60 + i64::from(second),
        )
    })
}

/// Days from 1970-01-01 to a proleptic Gregorian date (H. Hinnant's `days_from_civil`).
fn days_since_epoch(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// Formats epoch seconds as an ISO-8601 UTC instant, `2026-10-25T08:30:00Z`.
pub fn format_instant(epoch_seconds: i64) -> Result<String, TimeError> {
    let instant = Timestamp::from_second(epoch_seconds).map_err(TimeError::OutOfRange)?;
    Ok(instant.to_string())
}

/// `floor(end) - floor(start)`, clamped at 0 (R-16, R-18): `.900` to `1.100` is 1 s.
#[must_use]
pub fn duration_seconds(start: Timestamp, end: Timestamp) -> i64 {
    whole_seconds(end)
        .saturating_sub(whole_seconds(start))
        .max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_instant_rejects_text_that_is_not_a_utc_instant() {
        for text in [
            "",
            "yesterday",
            "2026-10-25",
            "2026-10-25T08:30:00",
            "2026-10-25T08:30:00+06:00",
            "2026-10-25T14:30:00+06:00[Asia/Dhaka]",
            "2026-13-25T08:30:00Z",
            "Z",
        ] {
            assert!(
                matches!(parse_instant(text), Err(TimeError::MalformedInstant { value }) if value == text),
                "{text:?} was accepted"
            );
        }
    }

    #[test]
    fn parse_instant_covers_the_contract_range_past_jiffs_end() {
        // The server answers these too; jiff's `Timestamp` ends at 9999-12-30T22:00:00Z.
        assert!(matches!(
            parse_instant("9999-12-31T23:59:59Z"),
            Ok(253_402_300_799)
        ));
        assert!(matches!(
            parse_instant("0000-01-01T00:00:00Z"),
            Ok(-62_167_219_200)
        ));
    }

    proptest::proptest! {
        #[test]
        fn parse_instant_agrees_with_jiff_on_every_whole_second(
            seconds in Timestamp::MIN.as_second()..=Timestamp::MAX.as_second(),
            fraction in r"(\.[0-9]{1,20})?",
        ) {
            let iso = Timestamp::from_second(seconds)
                .unwrap_or_else(|error| panic!("{error}"))
                .strftime("%Y-%m-%dT%H:%M:%S")
                .to_string();
            // jiff prints years outside 0000..=9999 with a sign, which the contract rejects.
            let in_contract = !iso.starts_with('-') && !iso.starts_with('+');
            let parsed = parse_instant(&format!("{iso}{fraction}Z"));
            if in_contract {
                proptest::prop_assert_eq!(parsed.ok(), Some(seconds));
            } else {
                proptest::prop_assert!(parsed.is_err());
            }
        }
    }

    #[test]
    fn format_instant_rejects_seconds_beyond_jiffs_range() {
        assert!(matches!(
            format_instant(i64::MAX),
            Err(TimeError::OutOfRange(_))
        ));
    }

    #[test]
    fn whole_seconds_floors_negative_fractions() {
        let instant = Timestamp::new(-2, -1).map_err(TimeError::OutOfRange);
        assert!(matches!(instant.map(whole_seconds), Ok(-3)));
    }
}
