//! Implementations of `ports` that are themselves platform-free: SQLite store and HTTP and
//! WebSocket transport, each behind a cargo feature, and the system clock, which needs only `std`
//! and is always built.
//!
//! Depends on `ports` and `domain`; nothing else in the crate depends on it except `api`.

use std::time::{SystemTime, UNIX_EPOCH};

use jiff::Timestamp;

use crate::ports::Clock;

/// The device's wall clock. The displayed time is `deviceNow + offset` to the server clock
/// (spec section 8); applying the offset is the sync layer's job, not this adapter's.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Timestamp {
        let now = SystemTime::now();
        // `Timestamp::now` would panic on a system time outside years -9999..=9999; a clock that
        // wrong is clamped to the nearest end instead, since nothing may panic across the FFI.
        Timestamp::try_from(now).unwrap_or(if now >= UNIX_EPOCH {
            Timestamp::MAX
        } else {
            Timestamp::MIN
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_clock_reads_the_current_time() {
        let before = Timestamp::try_from(SystemTime::now()).unwrap_or(Timestamp::MIN);
        let now = SystemClock.now();
        let after = Timestamp::try_from(SystemTime::now()).unwrap_or(Timestamp::MAX);
        assert!(before <= now && now <= after);
    }
}
