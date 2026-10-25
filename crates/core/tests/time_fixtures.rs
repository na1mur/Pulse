//! D-19: runs every case of the shared time-math fixture suite (`packages/contract/fixtures/time/`,
//! format in its README, rules in ADR-0004) against the core's time-math module.
//!
//! The runner reads the whole directory and fails on a file it has no runner for, a missing file,
//! or a case whose input or expected value does not match its shape (`deny_unknown_fields`), so a
//! new fixture can never be skipped silently. Each file is one test; a failing test lists every
//! failing case by name.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use jiff::Timestamp;
use jiff::civil::Weekday;
use pulse_contract_types::types::Weekday as ContractWeekday;
use pulse_core::domain::time::{
    self, DayKey, PeriodKind, SessionSpan, TimeError, day_bounds, day_key, day_rows,
    duration_seconds, format_clock, parse_instant, period, period_id, period_total, summary_parts,
};
use serde::Deserialize;
use serde::de::DeserializeOwned;

/// Every fixture file this runner handles, by name without `.json`.
const KNOWN_FILES: [&str; 9] = [
    "instant",
    "invalid-instant",
    "duration",
    "day-key",
    "day-bounds",
    "period",
    "day-rows",
    "period-total",
    "display",
];

fn fixtures_directory() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/contract/fixtures/time")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureFile<Input, Expected> {
    #[expect(
        dead_code,
        reason = "part of the file format; only checked for presence"
    )]
    description: String,
    #[expect(
        dead_code,
        reason = "part of the file format; only checked for presence"
    )]
    rules: Vec<String>,
    cases: Vec<Case<Input, Expected>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Case<Input, Expected> {
    name: String,
    input: Input,
    expected: Expected,
}

/// The contract's week start (the generated wire type reads the fixture's `"monday"`..`"sunday"`)
/// as the domain's `jiff` weekday.
fn week_start(day: ContractWeekday) -> Weekday {
    match day {
        ContractWeekday::Monday => Weekday::Monday,
        ContractWeekday::Tuesday => Weekday::Tuesday,
        ContractWeekday::Wednesday => Weekday::Wednesday,
        ContractWeekday::Thursday => Weekday::Thursday,
        ContractWeekday::Friday => Weekday::Friday,
        ContractWeekday::Saturday => Weekday::Saturday,
        ContractWeekday::Sunday => Weekday::Sunday,
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Kind {
    Day,
    Week,
    Month,
    Year,
}

impl From<Kind> for PeriodKind {
    fn from(value: Kind) -> Self {
        match value {
            Kind::Day => PeriodKind::Day,
            Kind::Week => PeriodKind::Week,
            Kind::Month => PeriodKind::Month,
            Kind::Year => PeriodKind::Year,
        }
    }
}

/// Reads and parses one fixture file; a missing file or a shape mismatch fails the test.
#[expect(
    clippy::panic,
    reason = "a fixture file that cannot be read or parsed must fail the test, naming the file"
)]
fn load<Input: DeserializeOwned, Expected: DeserializeOwned>(
    file: &str,
) -> Vec<Case<Input, Expected>> {
    let path = fixtures_directory().join(format!("{file}.json"));
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()));
    let parsed: FixtureFile<Input, Expected> = serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("{file}.json does not match its case shape: {error}"));
    assert!(!parsed.cases.is_empty(), "{file}.json has no cases");
    parsed.cases
}

/// Runs `check` on every case and fails once, naming every failing case.
fn run<Input, Expected>(
    file: &str,
    cases: Vec<Case<Input, Expected>>,
    check: impl Fn(&Input, &Expected) -> Result<(), String>,
) {
    let failures: Vec<String> = cases
        .iter()
        .filter_map(|case| {
            check(&case.input, &case.expected)
                .err()
                .map(|message| format!("  {file}: \"{}\": {message}", case.name))
        })
        .collect();
    assert!(
        failures.is_empty(),
        "{} of {} cases failed:\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n")
    );
}

fn instant(text: &str) -> Result<Timestamp, String> {
    text.parse()
        .map_err(|error| format!("bad instant {text:?} in fixture: {error}"))
}

fn day(text: &str) -> Result<DayKey, String> {
    text.parse()
        .map_err(|error: TimeError| format!("bad day {text:?} in fixture: {error}"))
}

fn zone(name: &str) -> Result<jiff::tz::TimeZone, String> {
    time::time_zone(name).map_err(|error| error.to_string())
}

fn same<T: PartialEq + std::fmt::Debug>(what: &str, actual: T, expected: T) -> Result<(), String> {
    if actual == expected {
        Ok(())
    } else {
        Err(format!("{what}: expected {expected:?}, got {actual:?}"))
    }
}

#[test]
fn the_fixture_directory_holds_exactly_the_files_this_runner_handles() {
    let directory = fixtures_directory();
    let present: BTreeSet<String> = fs::read_dir(&directory)
        .unwrap_or_else(|error| panic!("cannot list {}: {error}", directory.display()))
        .map(|entry| {
            let entry = entry.unwrap_or_else(|error| panic!("cannot read an entry: {error}"));
            entry.file_name().to_string_lossy().into_owned()
        })
        .collect();
    let known: BTreeSet<String> = KNOWN_FILES
        .iter()
        .map(|file| format!("{file}.json"))
        .collect();

    let unknown: Vec<&String> = present.difference(&known).collect();
    let missing: Vec<&String> = known.difference(&present).collect();
    assert!(
        unknown.is_empty() && missing.is_empty(),
        "unknown fixture files {unknown:?} (add a runner here and in the server), missing {missing:?}"
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct InstantInput {
    instant: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct InstantExpected {
    epoch_seconds: i64,
}

#[test]
fn instant_fixtures() {
    run(
        "instant",
        load("instant"),
        |input: &InstantInput, expected: &InstantExpected| {
            let seconds = parse_instant(&input.instant).map_err(|error| error.to_string())?;
            same("epochSeconds", seconds, expected.epoch_seconds)?;
            // Whole-second instants read back as the same text (formatInstant is the inverse).
            if !input.instant.contains('.') {
                let text = time::format_instant(seconds).map_err(|error| error.to_string())?;
                same("formatInstant", text.as_str(), input.instant.as_str())?;
            }
            Ok(())
        },
    );
}

/// The one shared error code: every case must fail with it.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ErrorExpected {
    error: ErrorCode,
}

#[derive(Debug, Deserialize)]
enum ErrorCode {
    #[serde(rename = "malformed-instant")]
    MalformedInstant,
}

#[test]
fn invalid_instant_fixtures() {
    run(
        "invalid-instant",
        load("invalid-instant"),
        |input: &InstantInput, expected: &ErrorExpected| match (
            &expected.error,
            parse_instant(&input.instant),
        ) {
            (ErrorCode::MalformedInstant, Err(TimeError::MalformedInstant { value }))
                if value == input.instant =>
            {
                Ok(())
            }
            (ErrorCode::MalformedInstant, other) => {
                Err(format!("expected MalformedInstant, got {other:?}"))
            }
        },
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DurationInput {
    start: String,
    end: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SecondsExpected {
    seconds: i64,
}

#[test]
fn duration_fixtures() {
    run(
        "duration",
        load("duration"),
        |input: &DurationInput, expected: &SecondsExpected| {
            let seconds = duration_seconds(instant(&input.start)?, instant(&input.end)?);
            same("seconds", seconds, expected.seconds)
        },
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DayKeyInput {
    instant: String,
    time_zone: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DayExpected {
    day: String,
}

#[test]
fn day_key_fixtures() {
    run(
        "day-key",
        load("day-key"),
        |input: &DayKeyInput, expected: &DayExpected| {
            let actual = day_key(instant(&input.instant)?, &zone(&input.time_zone)?);
            same("day", actual, day(&expected.day)?)
        },
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DayBoundsInput {
    day: String,
    time_zone: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BoundsExpected {
    start: String,
    end: String,
    seconds: i64,
}

#[test]
fn day_bounds_fixtures() {
    run(
        "day-bounds",
        load("day-bounds"),
        |input: &DayBoundsInput, expected: &BoundsExpected| {
            let bounds = day_bounds(day(&input.day)?, &zone(&input.time_zone)?)
                .map_err(|error| error.to_string())?;
            same("start", bounds.start, instant(&expected.start)?)?;
            same("end", bounds.end, instant(&expected.end)?)?;
            same("seconds", bounds.seconds(), expected.seconds)
        },
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PeriodInput {
    kind: Kind,
    day: String,
    week_start: ContractWeekday,
    time_zone: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PeriodExpected {
    id: String,
    first_day: String,
    last_day: String,
    start: String,
    end: String,
    seconds: i64,
}

#[test]
fn period_fixtures() {
    run(
        "period",
        load("period"),
        |input: &PeriodInput, expected: &PeriodExpected| {
            let (kind, day_key, week_start) = (
                input.kind.into(),
                day(&input.day)?,
                week_start(input.week_start),
            );
            let found = period(kind, day_key, week_start, &zone(&input.time_zone)?)
                .map_err(|error| error.to_string())?;
            same("id", found.id.as_str(), expected.id.as_str())?;
            let id = period_id(kind, day_key, week_start).map_err(|error| error.to_string())?;
            same("periodId", id.as_str(), expected.id.as_str())?;
            same("firstDay", found.first_day, day(&expected.first_day)?)?;
            same("lastDay", found.last_day, day(&expected.last_day)?)?;
            same("start", found.start, instant(&expected.start)?)?;
            same("end", found.end, instant(&expected.end)?)?;
            same("seconds", found.seconds(), expected.seconds)
        },
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SessionInput {
    started_at: String,
    /// Required but nullable, as in the fixture schema: a missing key is a shape error.
    #[serde(deserialize_with = "Option::deserialize")]
    ended_at: Option<String>,
    time_zone: String,
}

impl SessionInput {
    fn session(&self) -> Result<SessionSpan, String> {
        session(&self.started_at, self.ended_at.as_deref(), &self.time_zone)
    }
}

fn session(
    started_at: &str,
    ended_at: Option<&str>,
    time_zone: &str,
) -> Result<SessionSpan, String> {
    Ok(SessionSpan {
        started_at: instant(started_at)?,
        ended_at: ended_at.map(instant).transpose()?,
        time_zone: zone(time_zone)?,
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DayRowsInput {
    started_at: String,
    /// Required but nullable, as in the fixture schema: a missing key is a shape error.
    #[serde(deserialize_with = "Option::deserialize")]
    ended_at: Option<String>,
    time_zone: String,
    now: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DayRowsExpected {
    rows: Vec<RowExpected>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RowExpected {
    day: String,
    start: String,
    end: String,
    seconds: i64,
    local_start: String,
    local_end: String,
}

#[test]
fn day_rows_fixtures() {
    run(
        "day-rows",
        load("day-rows"),
        |input: &DayRowsInput, expected: &DayRowsExpected| {
            let session = session(
                &input.started_at,
                input.ended_at.as_deref(),
                &input.time_zone,
            )?;
            let rows =
                day_rows(&session, instant(&input.now)?).map_err(|error| error.to_string())?;
            same("row count", rows.len(), expected.rows.len())?;
            for (index, (row, want)) in rows.iter().zip(&expected.rows).enumerate() {
                let at = |field: &str| format!("rows[{index}].{field}");
                same(&at("day"), row.day, day(&want.day)?)?;
                same(&at("start"), row.start, instant(&want.start)?)?;
                same(&at("end"), row.end, instant(&want.end)?)?;
                same(&at("seconds"), row.seconds(), want.seconds)?;
                let local_start = row.local_start.strftime("%H:%M:%S").to_string();
                same(
                    &at("localStart"),
                    local_start.as_str(),
                    want.local_start.as_str(),
                )?;
                let local_end = row.local_end.strftime("%H:%M:%S").to_string();
                same(&at("localEnd"), local_end.as_str(), want.local_end.as_str())?;
            }
            Ok(())
        },
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PeriodTotalInput {
    sessions: Vec<SessionInput>,
    kind: Kind,
    day: String,
    week_start: ContractWeekday,
    time_zone: String,
    now: String,
}

#[test]
fn period_total_fixtures() {
    run(
        "period-total",
        load("period-total"),
        |input: &PeriodTotalInput, expected: &SecondsExpected| {
            let sessions = input
                .sessions
                .iter()
                .map(SessionInput::session)
                .collect::<Result<Vec<_>, _>>()?;
            let total = period_total(
                &sessions,
                input.kind.into(),
                day(&input.day)?,
                week_start(input.week_start),
                &zone(&input.time_zone)?,
                instant(&input.now)?,
            )
            .map_err(|error| error.to_string())?;
            same("seconds", total, expected.seconds)
        },
    );
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DisplayInput {
    seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DisplayExpected {
    clock: String,
    summary: SummaryExpected,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SummaryExpected {
    hours: i64,
    minutes: i64,
}

#[test]
fn display_fixtures() {
    run(
        "display",
        load("display"),
        |input: &DisplayInput, expected: &DisplayExpected| {
            same(
                "clock",
                format_clock(input.seconds).as_str(),
                expected.clock.as_str(),
            )?;
            let summary = summary_parts(input.seconds);
            same("summary.hours", summary.hours, expected.summary.hours)?;
            same("summary.minutes", summary.minutes, expected.summary.minutes)
        },
    );
}
