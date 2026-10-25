//! The on-device activity pipeline (spec 8.8): the 7-day sample store, presence, and accumulation
//! into per-day, per-class usage increments. The only place that decides what activity data
//! leaves the device (principle 11, R-41).
//!
//! Depends on `app`, `domain` and `ports`.
