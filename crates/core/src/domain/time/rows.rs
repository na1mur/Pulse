//! Day attribution (R-11, R-17): a session split at local midnights into per-day history rows,
//! and the worked time of a period summed from those rows.

use jiff::civil::{Time, Weekday};
use jiff::tz::TimeZone;
use jiff::{SignedDuration, Timestamp};

use super::TimeError;
use super::day::{DayKey, day_key, start_of_day};
use super::instant::floor;
use super::period::{PeriodKind, period};

/// What time math needs of a session: its instants and the zone it was created in (R-09).
/// `ended_at` is `None` while it runs.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionSpan {
    pub started_at: Timestamp,
    pub ended_at: Option<Timestamp>,
    pub time_zone: TimeZone,
}

/// One history row (R-11): the part `[start, end)` of a session on its local `day`, with the
/// wall-clock times to show. A row ending at its day's end shows the day's last second
/// (`23:59:59`); rows carry no offset, so both passes of a repeated hour show the same times.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DayRow {
    pub day: DayKey,
    pub start: Timestamp,
    pub end: Timestamp,
    pub local_start: Time,
    pub local_end: Time,
}

impl DayRow {
    #[must_use]
    pub fn seconds(&self) -> i64 {
        self.end.as_second() - self.start.as_second()
    }
}

/// Splits a session into one row per local day with more than 0 seconds, in the session's own
/// zone. Instants are floored first, so the rows sum to the session's duration. `now` bounds only
/// a running session (a skewed clock never shortens history); `now` at or before the start of a
/// running session gives no rows.
pub fn day_rows(session: &SessionSpan, now: Timestamp) -> Result<Vec<DayRow>, TimeError> {
    let zone = &session.time_zone;
    let start = floor(session.started_at)?;
    let end = floor(session.ended_at.unwrap_or(now))?;
    let mut rows = Vec::new();
    let mut cursor = start;
    while cursor < end {
        // Keyed by the cursor's own day rather than "previous day + 1", so a day a zone skipped
        // entirely (zero length) never yields a row.
        let day = day_key(cursor, zone);
        let day_end = start_of_day(day.next()?, zone)?;
        let row_end = day_end.min(end);
        let shown_end = if row_end == day_end {
            before(day_end)?
        } else {
            row_end
        };
        rows.push(DayRow {
            day,
            start: cursor,
            end: row_end,
            local_start: zone.to_datetime(cursor).time(),
            local_end: zone.to_datetime(shown_end).time(),
        });
        cursor = row_end;
    }
    Ok(rows)
}

/// Worked time of a period (R-12, R-17): the seconds of every row whose day key, in its
/// session's zone, is one of the period's day keys in `zone` (the user's setting). Running
/// sessions count up to `now`.
pub fn period_total(
    sessions: &[SessionSpan],
    kind: PeriodKind,
    day: DayKey,
    week_start: Weekday,
    zone: &TimeZone,
    now: Timestamp,
) -> Result<i64, TimeError> {
    let period = period(kind, day, week_start, zone)?;
    let mut total = 0;
    for session in sessions {
        for row in day_rows(session, now)? {
            if period.contains(row.day) {
                total += row.seconds();
            }
        }
    }
    Ok(total)
}

/// The last whole second before `instant`.
fn before(instant: Timestamp) -> Result<Timestamp, TimeError> {
    instant
        .checked_sub(SignedDuration::from_secs(1))
        .map_err(TimeError::OutOfRange)
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;
    use crate::domain::time::{day_bounds, duration_seconds, time_zone};

    /// The fixture zones: whole, half-hour-ish and quarter-hour offsets, both hemispheres' DST and
    /// a skipped midnight.
    const ZONES: [&str; 6] = [
        "UTC",
        "America/Los_Angeles",
        "Asia/Dhaka",
        "Pacific/Auckland",
        "Asia/Kathmandu",
        "America/Santiago",
    ];

    /// 2020-01-01 to 2035-01-01, a range with DST changes in every fixture zone.
    const FROM: i64 = 1_577_836_800;
    const TO: i64 = 2_051_222_400;

    fn zone(index: usize) -> TimeZone {
        time_zone(ZONES[index]).unwrap_or_else(|error| panic!("{error}"))
    }

    fn at(seconds: i64, nanos: i32) -> Timestamp {
        Timestamp::new(seconds, nanos).unwrap_or_else(|error| panic!("{error}"))
    }

    proptest! {
        #[test]
        fn rows_tile_the_session_and_sum_to_its_duration(
            zone_index in 0..ZONES.len(),
            start in FROM..TO,
            length in 0_i64..40 * 86_400,
            start_nanos in 0..1_000_000_000_i32,
            end_nanos in 0..1_000_000_000_i32,
        ) {
            let zone = zone(zone_index);
            let session = SessionSpan {
                started_at: at(start, start_nanos),
                ended_at: Some(at(start + length, end_nanos)),
                time_zone: zone.clone(),
            };
            let rows = day_rows(&session, at(FROM, 0)).unwrap_or_else(|error| panic!("{error}"));

            let total: i64 = rows.iter().map(DayRow::seconds).sum();
            prop_assert_eq!(total, duration_seconds(session.started_at, at(start + length, end_nanos)));
            prop_assert!(rows.iter().all(|row| row.seconds() > 0));
            prop_assert!(rows.windows(2).all(|pair| pair[0].end == pair[1].start && pair[0].day < pair[1].day));
            for row in &rows {
                let bounds = day_bounds(row.day, &zone).unwrap_or_else(|error| panic!("{error}"));
                prop_assert!(bounds.start <= row.start && row.end <= bounds.end);
            }
        }

        #[test]
        fn a_days_bounds_hold_exactly_its_own_instants(
            zone_index in 0..ZONES.len(),
            instant in FROM..TO,
        ) {
            let zone = zone(zone_index);
            let day = day_key(at(instant, 0), &zone);
            let bounds = day_bounds(day, &zone).unwrap_or_else(|error| panic!("{error}"));

            prop_assert!(bounds.start <= at(instant, 0) && at(instant, 0) < bounds.end);
            prop_assert_eq!(day_key(bounds.start, &zone), day);
            prop_assert_eq!(day_key(before(bounds.start).unwrap_or_else(|error| panic!("{error}")), &zone) < day, true);
            prop_assert_eq!(day_key(before(bounds.end).unwrap_or_else(|error| panic!("{error}")), &zone), day);
            prop_assert!(day_key(bounds.end, &zone) > day);
        }
    }
}
