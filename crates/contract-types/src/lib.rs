//! Pulse wire types and typed HTTP client, generated from the contract (`packages/contract`,
//! ADR-0003) so the Rust core cannot drift from the server: [`types`] holds every schema of the
//! OpenAPI document (entities, requests, results, events, realtime messages, the error body) and,
//! with the `client` feature, `Client` has one async method per fully specified operation.
//!
//! Everything below `generated/` is written by `cargo run -p pulse-contract-codegen --locked`
//! (`codegen/src/main.rs`) from `packages/contract/generated/openapi.json`; never edit it. A
//! codegen test fails when it is stale.
//!
//! Using the client:
//! - Build it with `Client::new_with_client` and a `reqwest::Client` the transport adapter
//!   configured (TLS, timeouts). `Client::new` unwraps the builder's result, which must not
//!   happen on a production path.
//! - Every request needs `Authorization: Bearer`; the contract declares it, but the generated
//!   client does not add it.
//! - Every response carries `Pulse-Server-Time` and `Pulse-Request-Id` headers (ADR-0003); read
//!   them from `ResponseValue::headers` or, for errors, from the error's response.

// The generated code cannot be fixed by hand, so the `allow`s below are the workspace lints it
// trips: progenitor writes `#[allow(clippy::all)]` without a reason, and unwraps the compilation
// of constant patterns (`tests/patterns.rs` compiles every one) and the reqwest builder in
// `Client::new` (not used in production, see above).

#[rustfmt::skip]
#[allow(
    clippy::allow_attributes_without_reason,
    clippy::unwrap_used,
    reason = "generated code: change the generator settings or the contract, never the output"
)]
#[path = "generated/types.rs"]
pub mod types;

#[cfg(feature = "client")]
#[rustfmt::skip]
#[allow(
    clippy::allow_attributes_without_reason,
    clippy::unwrap_used,
    reason = "generated code: change the generator settings or the contract, never the output"
)]
#[path = "generated/client.rs"]
mod client;

#[cfg(feature = "client")]
pub use client::{ByteStream, Client, ClientInfo, Error, ResponseValue};
