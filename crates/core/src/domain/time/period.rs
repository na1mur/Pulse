//! Periods (R-12..R-14): the day, week, month or year holding a day, as day keys and instants.

use std::fmt;

use jiff::civil::Weekday;
use jiff::tz::TimeZone;
use jiff::{Span, Timestamp};

use super::TimeError;
use super::day::{DayKey, start_of_day};

/// R-13. Goals use day, week and month (R-19); stats also use year.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PeriodKind {
    Day,
    Week,
    Month,
    Year,
}

/// R-14 period ID: day `2026-10-24`, week `W2026-10-19` (its first day), month `2026-10`, year
/// `2026`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PeriodId(String);

impl PeriodId {
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for PeriodId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A period in a time zone: its days `first_day..=last_day` and its instants `[start, end)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Period {
    pub id: PeriodId,
    pub first_day: DayKey,
    pub last_day: DayKey,
    pub start: Timestamp,
    pub end: Timestamp,
}

impl Period {
    /// The period's length, DST days included (a week holding a 25 h day is 608 400 s).
    #[must_use]
    pub fn seconds(&self) -> i64 {
        self.end.as_second() - self.start.as_second()
    }

    pub(super) fn contains(&self, day: DayKey) -> bool {
        (self.first_day..=self.last_day).contains(&day)
    }
}

/// The `kind` period holding `day`, its day keys and bounds in `zone` (the user's setting, R-12).
/// `week_start` matters only for weeks (R-13, default Monday).
pub fn period(
    kind: PeriodKind,
    day: DayKey,
    week_start: Weekday,
    zone: &TimeZone,
) -> Result<Period, TimeError> {
    let (first_day, last_day) = days(kind, day, week_start)?;
    Ok(Period {
        id: id(kind, first_day),
        first_day,
        last_day,
        start: start_of_day(first_day, zone)?,
        end: start_of_day(last_day.next()?, zone)?,
    })
}

/// The ID of the `kind` period holding `day` (R-14); needs no time zone.
pub fn period_id(
    kind: PeriodKind,
    day: DayKey,
    week_start: Weekday,
) -> Result<PeriodId, TimeError> {
    let (first_day, _) = days(kind, day, week_start)?;
    Ok(id(kind, first_day))
}

/// First and last day of the period, inclusive.
fn days(kind: PeriodKind, day: DayKey, week_start: Weekday) -> Result<(DayKey, DayKey), TimeError> {
    let date = day.date();
    let (first, last) = match kind {
        PeriodKind::Day => (date, date),
        PeriodKind::Week => {
            // The latest `week_start` weekday on or before `day`. `Span::days` panics only beyond
            // its range of millions of days; `back` is 0..=6 and 6 is a literal.
            let back = i64::from(date.weekday().since(week_start));
            let first = date
                .checked_sub(Span::new().days(back))
                .map_err(TimeError::OutOfRange)?;
            let last = first
                .checked_add(Span::new().days(6))
                .map_err(TimeError::OutOfRange)?;
            (first, last)
        }
        PeriodKind::Month => (date.first_of_month(), date.last_of_month()),
        PeriodKind::Year => (date.first_of_year(), date.last_of_year()),
    };
    Ok((DayKey::from(first), DayKey::from(last)))
}

fn id(kind: PeriodKind, first_day: DayKey) -> PeriodId {
    let date = first_day.date();
    PeriodId(match kind {
        PeriodKind::Day => first_day.to_string(),
        PeriodKind::Week => format!("W{first_day}"),
        PeriodKind::Month => format!("{:04}-{:02}", date.year(), date.month()),
        PeriodKind::Year => format!("{:04}", date.year()),
    })
}
