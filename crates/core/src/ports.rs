//! The traits through which every side effect enters the core: clock, store, transport,
//! connectivity, notifier, foreground source and presence. Platform code implements them; tests
//! use fakes.
//!
//! Depends on `domain` types only.
