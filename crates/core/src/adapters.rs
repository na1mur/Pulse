//! Implementations of `ports` that are themselves platform-free: SQLite store, HTTP and WebSocket
//! transport, system clock, each behind a cargo feature.
//!
//! Depends on `ports` and `domain`; nothing else in the crate depends on it except `api`.
