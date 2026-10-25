//! Cross-language conformance (T0.4), everything outside HTTP operations: every event, realtime
//! message and error example in `packages/contract/generated/examples.json` decodes into the
//! generated Rust type and re-encodes to the same JSON (allowed differences:
//! `support::equivalent`). The `match` functions below are exhaustive, so a new variant in the
//! contract does not compile until it is mapped here, and the coverage asserts fail until it has
//! an example.
#![cfg(test)]

mod support;

use std::collections::BTreeSet;

use pulse_contract_types::types::{
    ClientMessage, DataEvent, ErrorBody, ErrorCode, Event, ServerMessage,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

/// Decodes `example` as `T`, re-encodes it and checks the result is equivalent.
fn round_trip<T: DeserializeOwned + Serialize>(example: &Value, at: &str) -> T {
    let decoded: T = serde_json::from_value(example.clone())
        .unwrap_or_else(|error| panic!("{at} does not decode: {error}"));
    let encoded = serde_json::to_value(&decoded).unwrap();
    support::equivalent(example, &encoded, at).unwrap_or_else(|failure| panic!("{failure}"));
    decoded
}

fn event_name(event: &Event) -> &'static str {
    match event {
        Event::TimerChangedEvent(_) => "timer.changed",
        Event::SessionUpsertedEvent(_) => "session.upserted",
        Event::SessionDeletedEvent(_) => "session.deleted",
        Event::TagUpsertedEvent(_) => "tag.upserted",
        Event::TagDeletedEvent(_) => "tag.deleted",
        Event::GoalsChangedEvent(_) => "goals.changed",
        Event::PreferencesChangedEvent(_) => "preferences.changed",
        Event::AchievementUnlockedEvent(_) => "achievement.unlocked",
        Event::CreditsChangedEvent(_) => "credits.changed",
        Event::CredentialsRevokedEvent(_) => "credentials.revoked",
    }
}

/// Every name `event_name` returns: spec section 7.3.
const EVENT_NAMES: [&str; 10] = [
    "timer.changed",
    "session.upserted",
    "session.deleted",
    "tag.upserted",
    "tag.deleted",
    "goals.changed",
    "preferences.changed",
    "achievement.unlocked",
    "credits.changed",
    "credentials.revoked",
];

fn client_message_type(message: &ClientMessage) -> &'static str {
    match message {
        ClientMessage::Auth(_) => "auth",
        ClientMessage::Ping => "ping",
    }
}

fn server_message_type(message: &ServerMessage) -> &'static str {
    match message {
        ServerMessage::Ready { .. } => "ready",
        ServerMessage::Event { .. } => "event",
        ServerMessage::Pong { .. } => "pong",
        ServerMessage::Error { .. } => "error",
    }
}

fn error_code(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::Validation => "VALIDATION",
        ErrorCode::Unauthenticated => "UNAUTHENTICATED",
        ErrorCode::Forbidden => "FORBIDDEN",
        ErrorCode::NotFound => "NOT_FOUND",
        ErrorCode::Conflict => "CONFLICT",
        ErrorCode::RateLimited => "RATE_LIMITED",
        ErrorCode::Unavailable => "UNAVAILABLE",
        ErrorCode::Internal => "INTERNAL",
    }
}

fn list<'a>(examples: &'a Value, section: &str) -> &'a Vec<Value> {
    examples[section]
        .as_array()
        .unwrap_or_else(|| panic!("examples.json has no {section} list"))
}

#[test]
fn examples_have_no_section_without_a_rust_mapping() {
    let examples = support::examples();

    let sections: BTreeSet<&str> = examples
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();

    let mapped = BTreeSet::from([
        "$comment",
        "operations",
        "events",
        "clientMessages",
        "serverMessages",
        "errors",
    ]);
    assert_eq!(
        sections, mapped,
        "a new examples.json section needs a conformance test"
    );
}

#[test]
fn every_event_example_round_trips_as_its_own_event() {
    let examples = support::examples();
    let events = examples["events"].as_object().unwrap();

    for (name, example) in events {
        let decoded: Event = round_trip(example, &format!("events.{name}"));
        assert_eq!(
            event_name(&decoded),
            name,
            "events.{name} decoded as another event"
        );
    }

    let covered: BTreeSet<&str> = events.keys().map(String::as_str).collect();
    assert_eq!(
        covered,
        BTreeSet::from(EVENT_NAMES),
        "every event needs an example"
    );
}

#[test]
fn the_change_feed_carries_every_event_except_credentials_revoked() {
    // ADR-0003: `credentials.revoked` is live-only; the change feed returns the data events.
    let examples = support::examples();

    for (name, example) in examples["events"].as_object().unwrap() {
        let decoded = serde_json::from_value::<DataEvent>(example.clone());

        if name == "credentials.revoked" {
            assert!(
                decoded.is_err(),
                "credentials.revoked must not be a data event"
            );
        } else {
            round_trip::<DataEvent>(example, &format!("data event {name}"));
        }
    }
}

#[test]
fn every_client_message_example_round_trips() {
    let examples = support::examples();

    let covered: BTreeSet<&str> = list(&examples, "clientMessages")
        .iter()
        .enumerate()
        .map(|(index, example)| {
            client_message_type(&round_trip(example, &format!("clientMessages[{index}]")))
        })
        .collect();

    assert_eq!(
        covered,
        BTreeSet::from(["auth", "ping"]),
        "every client message needs an example"
    );
}

#[test]
fn every_server_message_example_round_trips() {
    let examples = support::examples();

    let covered: BTreeSet<&str> = list(&examples, "serverMessages")
        .iter()
        .enumerate()
        .map(|(index, example)| {
            server_message_type(&round_trip(example, &format!("serverMessages[{index}]")))
        })
        .collect();

    assert_eq!(
        covered,
        BTreeSet::from(["ready", "event", "pong", "error"]),
        "every server message needs an example"
    );
}

#[test]
fn every_error_code_has_an_example_that_round_trips() {
    let examples = support::examples();

    let covered: BTreeSet<&str> = list(&examples, "errors")
        .iter()
        .enumerate()
        .map(|(index, example)| {
            error_code(round_trip::<ErrorBody>(example, &format!("errors[{index}]")).code)
        })
        .collect();

    let all = [
        "VALIDATION",
        "UNAUTHENTICATED",
        "FORBIDDEN",
        "NOT_FOUND",
        "CONFLICT",
        "RATE_LIMITED",
        "UNAVAILABLE",
        "INTERNAL",
    ];
    assert_eq!(
        covered,
        BTreeSet::from(all),
        "every error code needs an example (spec 7.1)"
    );
}
