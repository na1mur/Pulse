//! Test doubles for the `ports`, for this crate's tests and, through the `test-support` feature,
//! for other crates' tests. Only test and dev builds turn the feature on; no shell enables it.

use std::sync::{Mutex, PoisonError};

use jiff::{SignedDuration, Timestamp};

use crate::ports::Clock;

/// A clock that moves only when told to: `set` jumps to an instant, `advance` moves by a duration
/// (negative to simulate a clock stepped back). Shareable across threads like the real one.
#[derive(Debug)]
pub struct FakeClock {
    now: Mutex<Timestamp>,
}

impl FakeClock {
    #[must_use]
    pub fn new(now: Timestamp) -> Self {
        Self {
            now: Mutex::new(now),
        }
    }

    pub fn set(&self, now: Timestamp) {
        *self.lock() = now;
    }

    /// Moves the clock by `by`, saturating at jiff's range ends.
    pub fn advance(&self, by: SignedDuration) {
        let mut now = self.lock();
        *now = now.saturating_add(by).unwrap_or(if by.is_negative() {
            Timestamp::MIN
        } else {
            Timestamp::MAX
        });
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Timestamp> {
        // A test that panicked while holding the lock cannot leave a torn `Timestamp` behind.
        self.now.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Clock for FakeClock {
    fn now(&self) -> Timestamp {
        *self.lock()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn instant(text: &str) -> Timestamp {
        text.parse().unwrap_or_else(|error| panic!("{error}"))
    }

    #[test]
    fn the_fake_clock_stays_put_until_set_or_advanced() {
        let clock = FakeClock::new(instant("2026-10-25T08:30:00Z"));
        assert_eq!(clock.now(), instant("2026-10-25T08:30:00Z"));

        clock.advance(SignedDuration::from_secs(90));
        assert_eq!(clock.now(), instant("2026-10-25T08:31:30Z"));

        clock.advance(SignedDuration::from_secs(-3600));
        assert_eq!(clock.now(), instant("2026-10-25T07:31:30Z"));

        clock.set(instant("2026-11-01T09:30:00.250Z"));
        assert_eq!(clock.now(), instant("2026-11-01T09:30:00.250Z"));
    }

    #[test]
    fn advancing_past_the_end_of_time_saturates() {
        let clock = FakeClock::new(instant("9999-12-30T00:00:00Z"));
        clock.advance(SignedDuration::MAX);
        assert_eq!(clock.now(), Timestamp::MAX);
    }

    #[test]
    fn the_fake_clock_works_behind_the_port() {
        let clock: Box<dyn Clock> = Box::new(FakeClock::new(Timestamp::UNIX_EPOCH));
        assert_eq!(clock.now(), Timestamp::UNIX_EPOCH);
    }
}
