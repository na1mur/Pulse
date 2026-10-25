//! Pulse client core: the one library behind the desktop shell (directly) and the Android app
//! (through UniFFI). It has no UI and no platform dependency; clock, storage, transport,
//! connectivity and notifications come in through the traits in `ports` (docs/ARCHITECTURE.md
//! sections 2-3).
//!
//! Layering, inner to outer: `domain` <- `app` <- `sync` / `tracking` <- `api`, with `ports`
//! used by `app` and up and implemented by `adapters`. Only `api` is public.

pub mod api;

mod adapters;
mod app;
mod domain;
mod ports;
mod sync;
mod tracking;
