//! Pulse client core: the one library behind the desktop shell (directly) and the Android app
//! (through UniFFI). It has no UI and no platform dependency; clock, storage, transport,
//! connectivity and notifications come in through the traits in `ports` (docs/ARCHITECTURE.md
//! sections 2-3).
//!
//! Layering, inner to outer: `domain` <- `app` <- `sync` / `tracking` <- `api`, with `ports`
//! used by `app` and up and implemented by `adapters`. `api` is the facade the shells call;
//! `domain`, `ports` and `adapters` are public too, so integration tests (the shared fixtures,
//! D-19) and other crates' tests can reach time math, the `Clock` port and its implementations.

pub mod adapters;
pub mod api;
pub mod domain;
pub mod ports;
#[cfg(any(test, feature = "test-support"))]
pub mod test_support;

mod app;
mod sync;
mod tracking;
