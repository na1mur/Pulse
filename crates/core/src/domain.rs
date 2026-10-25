//! Pure, deterministic logic with no I/O, no clock reads and no randomness (`now` is passed in):
//! time math (R-10..R-18), the timer reducer (R-01..R-07), goals and streaks (R-19..R-28), credit
//! math (R-42..R-46), classification and usage increments (R-38..R-41).
//!
//! Depends on nothing else in this crate.
