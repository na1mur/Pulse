//! Shared by the conformance tests: the contract's generated examples and OpenAPI document, the
//! JSON comparison that states which differences are allowed and, with the client, an HTTP stub.
#![allow(
    dead_code,
    reason = "each test binary uses a different part of this module"
)]

#[cfg(feature = "client")]
pub mod http;

use std::path::Path;

use serde_json::Value;

fn contract_file(relative: &str) -> Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/contract/generated")
        .join(relative);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    serde_json::from_str(&text).unwrap()
}

/// `packages/contract/generated/examples.json`: a valid example of every operation part, event,
/// realtime message and error code.
pub fn examples() -> Value {
    contract_file("examples.json")
}

/// `packages/contract/generated/openapi.json`, the document the client was generated from.
pub fn openapi() -> Value {
    contract_file("openapi.json")
}

/// Compares what Rust produced (`actual`) with the contract's example (`expected`). The one
/// allowed difference: an instant may be written differently if it is the same instant (jiff
/// writes `08:00:01.000Z` as `08:00:01Z`; both are ISO-8601 UTC, ADR-0003). Every member must be
/// there, `null`s included: the contract has no optional nullable property (clearing is an
/// explicit `{ "value": null }` patch, ADR-0003), so Rust never needs to drop one.
pub fn equivalent(expected: &Value, actual: &Value, at: &str) -> Result<(), String> {
    match (expected, actual) {
        (Value::Object(expected), Value::Object(actual)) => {
            for (key, expected_value) in expected {
                let path = format!("{at}.{key}");
                let actual_value = actual
                    .get(key)
                    .ok_or_else(|| format!("{path}: missing in the Rust output"))?;
                equivalent(expected_value, actual_value, &path)?;
            }
            match actual.keys().find(|key| !expected.contains_key(*key)) {
                Some(extra) => Err(format!("{at}.{extra}: added by the Rust output")),
                None => Ok(()),
            }
        }
        (Value::Array(expected), Value::Array(actual)) if expected.len() == actual.len() => {
            expected
                .iter()
                .zip(actual)
                .enumerate()
                .try_for_each(|(index, (expected, actual))| {
                    equivalent(expected, actual, &format!("{at}[{index}]"))
                })
        }
        (Value::String(expected), Value::String(actual)) if same_instant(expected, actual) => {
            Ok(())
        }
        _ if expected == actual => Ok(()),
        _ => Err(format!("{at}: expected {expected}, Rust produced {actual}")),
    }
}

fn same_instant(expected: &str, actual: &str) -> bool {
    match (
        expected.parse::<jiff::Timestamp>(),
        actual.parse::<jiff::Timestamp>(),
    ) {
        (Ok(expected), Ok(actual)) => expected == actual,
        _ => false,
    }
}
