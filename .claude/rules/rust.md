---
paths:
  - "crates/**"
  - "apps/desktop/src-tauri/**"
---

# Rust in Pulse

Idioms: follow the `rust-best-practices` skill; Tauri specifics: `tauri-v2`. Structure: `docs/ARCHITECTURE.md` sections 2-3. On top of that:

- `crates/core` stays platform-free: no Tauri, Android, OS or UI crates; side effects only through the traits in `ports/`.
- `domain/` is pure and deterministic: no I/O, no clock reads, no randomness. Pass `now` in.
- Errors: `thiserror` enums per module, matched exhaustively; no `unwrap`/`expect`/`panic!` outside tests and provably-infallible spots (say why in a comment). Nothing panics across a Tauri command or UniFFI boundary.
- Time: integer seconds, `jiff` with the embedded tz database, only through the time-math module. Time and credit math pass the shared fixtures in `packages/contract/fixtures/` (D-19).
- Tracking: only the core decides what leaves the device; increments carry device, local day, class, seconds and an optional overlapped-session ID, nothing else (R-41). A test asserts it.
- Concurrency: `tokio` only where I/O needs it; bounded channels; no blocking work on async threads.
- Public surface (`api.rs`, Tauri commands, UniFFI) is small and takes/returns plain data types.
- Tests: unit tests in `#[cfg(test)]` modules, `proptest` for reducers and math, fake clock for anything timed; integration tests in `tests/`.
- Gate: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (exact commands in `CLAUDE.md` once scaffolded). Never silence a lint without a comment saying why.
- Dependencies: justify each new crate (size budget, spec 9.3); prefer `rustls`, avoid OpenSSL.
