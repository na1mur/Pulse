//! Update commands are field patches (ADR-0003, "Updates are field patches; clearing is
//! explicit"): an absent field leaves the value unchanged, `{ "value": null }` clears it and
//! `{ "value": x }` sets it. These tests pin the three states in the generated Rust types, both
//! ways, and that the contract keeps them expressible in Rust.
#![cfg(test)]

mod support;

use pulse_contract_types::types::{
    SummaryUpdate, TagUpdate, TitleUpdate, UpdateRunningRequest, UpdateSessionRequest,
};
use serde_json::{Value, json};

const COMMAND_ID: &str = "0192f1a6-0000-7000-8000-000000000030";
const TAG_ID: &str = "0192f1a6-0000-7000-8000-000000000011";

fn update_running(title: Option<TitleUpdate>, tag_id: Option<TagUpdate>) -> UpdateRunningRequest {
    UpdateRunningRequest {
        command_id: COMMAND_ID.parse().unwrap(),
        occurred_at: None,
        tag_id,
        title,
    }
}

#[test]
fn a_clear_is_sent_as_a_null_value() {
    let request = update_running(None, Some(TagUpdate { value: None }));

    let sent = serde_json::to_value(&request).unwrap();

    assert_eq!(
        sent,
        json!({ "commandId": COMMAND_ID, "tagId": { "value": null } })
    );
}

#[test]
fn an_unchanged_field_is_omitted() {
    let request = update_running(None, None);

    let sent = serde_json::to_value(&request).unwrap();

    assert_eq!(sent, json!({ "commandId": COMMAND_ID }));
}

#[test]
fn a_set_is_sent_with_its_value() {
    let title = TitleUpdate {
        value: Some("Contract package".try_into().unwrap()),
    };
    let tag = TagUpdate {
        value: Some(TAG_ID.parse().unwrap()),
    };
    let request = update_running(Some(title), Some(tag));

    let sent = serde_json::to_value(&request).unwrap();

    let expected = json!({
        "commandId": COMMAND_ID,
        "title": { "value": "Contract package" },
        "tagId": { "value": TAG_ID },
    });
    assert_eq!(sent, expected);
}

#[test]
fn absent_cleared_and_set_decode_as_three_different_states() {
    let decode = |body: Value| serde_json::from_value::<UpdateSessionRequest>(body).unwrap();

    let absent = decode(json!({ "commandId": COMMAND_ID }));
    let cleared = decode(json!({ "commandId": COMMAND_ID, "summary": { "value": null } }));
    let set = decode(json!({ "commandId": COMMAND_ID, "summary": { "value": "Done." } }));

    assert_eq!(absent.summary, None);
    assert_eq!(cleared.summary, Some(SummaryUpdate { value: None }));
    assert_eq!(
        set.summary,
        Some(SummaryUpdate {
            value: Some("Done.".try_into().unwrap())
        })
    );
}

#[test]
fn a_patch_without_a_value_is_rejected() {
    let decode = |body: Value| serde_json::from_value::<UpdateRunningRequest>(body);

    assert!(decode(json!({ "commandId": COMMAND_ID, "title": {} })).is_err());
}

/// serde reads a bare `null` in an `Option` field as `None`, so Rust decodes `"title": null` as
/// "unchanged", never as a clear. Rust never sends one (`None` is omitted, see above) and the
/// server rejects one (the field is not nullable), so the leniency only affects decoding.
#[test]
fn a_bare_null_never_means_clear() {
    let decoded: UpdateRunningRequest =
        serde_json::from_value(json!({ "commandId": COMMAND_ID, "title": null })).unwrap();

    assert_eq!(decoded.title, None);
}

/// typify gives an optional nullable property a single `None` for both "absent" and "null", so
/// Rust could not send that `null`. The contract must express clearing as a patch instead.
#[test]
fn the_contract_has_no_optional_nullable_property() {
    fn walk(schema: &Value, at: &str, found: &mut Vec<String>) {
        if !schema.is_object() {
            return;
        }
        let required: Vec<&str> = schema["required"]
            .as_array()
            .map(|names| names.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        if let Some(properties) = schema["properties"].as_object() {
            for (name, property) in properties {
                let path = format!("{at}.{name}");
                if property["nullable"] == true && !required.contains(&name.as_str()) {
                    found.push(path.clone());
                }
                walk(property, &path, found);
            }
        }
        for key in ["items", "additionalProperties"] {
            walk(&schema[key], &format!("{at}.{key}"), found);
        }
        for key in ["allOf", "oneOf", "anyOf"] {
            for (index, part) in schema[key].as_array().into_iter().flatten().enumerate() {
                walk(part, &format!("{at}.{key}[{index}]"), found);
            }
        }
    }
    let openapi = support::openapi();
    let mut found = Vec::new();

    for (name, schema) in openapi["components"]["schemas"].as_object().unwrap() {
        walk(schema, name, &mut found);
    }

    assert!(found.is_empty(), "optional nullable properties: {found:?}");
}
