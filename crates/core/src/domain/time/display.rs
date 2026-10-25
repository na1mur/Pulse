//! Display values (R-18): clocks `H:MM:SS` with unbounded hours, summaries in whole hours and
//! minutes rounded down, negatives clamped to 0. Locale-specific wording stays in the UIs.

/// A summary's whole hours and minutes (`Xh Ym`), rounded down so a goal never shows as reached
/// before it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SummaryParts {
    pub hours: i64,
    pub minutes: i64,
}

/// `H:MM:SS`, hours unbounded (`25:00:00` for a 25 h day, never days).
#[must_use]
pub fn format_clock(seconds: i64) -> String {
    let seconds = seconds.max(0);
    format!(
        "{}:{:02}:{:02}",
        seconds / 3600,
        seconds % 3600 / 60,
        seconds % 60
    )
}

#[must_use]
pub fn summary_parts(seconds: i64) -> SummaryParts {
    let seconds = seconds.max(0);
    SummaryParts {
        hours: seconds / 3600,
        minutes: seconds % 3600 / 60,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_largest_input_does_not_overflow() {
        assert_eq!(format_clock(i64::MAX), "2562047788015215:30:07");
        assert_eq!(
            summary_parts(i64::MIN),
            SummaryParts {
                hours: 0,
                minutes: 0
            }
        );
    }
}
