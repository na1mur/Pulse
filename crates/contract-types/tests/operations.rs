//! Cross-language conformance (T0.4), operations: every operation example in
//! `packages/contract/generated/examples.json` goes through the generated Rust client against a
//! stub server. The request the client sends must match the example's method, path (`params`),
//! query and body, and the example response must decode into the Rust type and re-encode to the
//! same JSON (allowed differences: `support::equivalent`).
#![cfg(test)]

mod support;

use pulse_contract_types::{Client, Error, ResponseValue, types};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use support::http::{Exchange, Reply};
use tokio::net::TcpListener;

/// What one operation call produced on the client side.
struct Called {
    /// The decoded success value, re-encoded (`null` for operations without a body).
    response: Value,
    server_time: Option<String>,
}

fn part<T: DeserializeOwned>(example: &Value, name: &str) -> T {
    serde_json::from_value(example.get(name).cloned().unwrap_or(Value::Null))
        .unwrap_or_else(|error| panic!("example {name} does not decode: {error}"))
}

/// A member of the example's `params` or `query`. Those examples hold URL text (`"since": "19"`,
/// ADR-0003), so a string that does not decode as itself is decoded as the JSON it spells.
fn member<T: DeserializeOwned>(example: &Value, name: &str, key: &str) -> T {
    let value = example
        .get(name)
        .and_then(|part| part.get(key))
        .cloned()
        .unwrap_or(Value::Null);
    serde_json::from_value(value.clone())
        .or_else(|error| match &value {
            Value::String(text) => serde_json::from_str(text).map_err(|_| error),
            _ => Err(error),
        })
        .unwrap_or_else(|error| panic!("example {name}.{key} does not decode: {error}"))
}

fn called<T: Serialize>(
    result: Result<ResponseValue<T>, Error<types::ErrorBody>>,
) -> Result<Called, String> {
    let value = result.map_err(|error| error.to_string())?;
    let server_time = value
        .headers()
        .get("pulse-server-time")
        .and_then(|header| header.to_str().ok())
        .map(str::to_owned);
    Ok(Called {
        response: serde_json::to_value(value.into_inner()).map_err(|error| error.to_string())?,
        server_time,
    })
}

/// Calls the generated method for `name` with the example's parts; `None` if the operation has
/// no Rust mapping yet (the coverage test then fails).
#[rustfmt::skip]
async fn call(client: &Client, name: &str, ex: &Value) -> Option<Result<Called, String>> {
    let id = |key: &str| -> uuid::Uuid { member(ex, "params", key) };
    Some(match name {
        "auth.register" => called(client.auth_register(&part(ex, "body")).await),
        "auth.verifyEmail" => called(client.auth_verify_email(&part(ex, "body")).await),
        "auth.resendVerification" => called(client.auth_resend_verification(&part(ex, "body")).await),
        "auth.login" => called(client.auth_login(&part(ex, "body")).await),
        "auth.signInWithGoogle" => called(client.auth_sign_in_with_google(&part(ex, "body")).await),
        "auth.refresh" => called(client.auth_refresh(&part(ex, "body")).await),
        "auth.logout" => called(client.auth_logout().await),
        "auth.listDevices" => called(client.auth_list_devices().await),
        "auth.revokeDevice" => called(client.auth_revoke_device(&id("deviceId")).await),
        "auth.changePassword" => called(client.auth_change_password(&part(ex, "body")).await),
        "auth.changeEmail" => called(client.auth_change_email(&part(ex, "body")).await),
        "auth.confirmEmailChange" => called(client.auth_confirm_email_change(&part(ex, "body")).await),
        "auth.requestPasswordReset" => called(client.auth_request_password_reset(&part(ex, "body")).await),
        "auth.resetPassword" => called(client.auth_reset_password(&part(ex, "body")).await),
        "auth.getMe" => called(client.auth_get_me().await),
        "auth.completeFirstSignIn" => called(client.auth_complete_first_sign_in(&part(ex, "body")).await),
        "auth.deleteAccount" => called(client.auth_delete_account(&part(ex, "body")).await),
        "timer.get" => called(client.timer_get().await),
        "timer.start" => called(client.timer_start(&part(ex, "body")).await),
        "timer.pause" => called(client.timer_pause(&part(ex, "body")).await),
        "timer.updateRunning" => called(client.timer_update_running(&part(ex, "body")).await),
        "sessions.list" => {
            let cursor: Option<types::SessionsListCursor> = member(ex, "query", "cursor");
            let tag_id: Option<uuid::Uuid> = member(ex, "query", "tagId");
            let text: Option<types::SessionsListText> = member(ex, "query", "text");
            called(client.sessions_list(member(ex, "query", "category"), cursor.as_ref(), &member(ex, "query", "from"), tag_id.as_ref(), text.as_ref(), &member(ex, "query", "to")).await)
        }
        "sessions.create" => called(client.sessions_create(&part(ex, "body")).await),
        "sessions.get" => called(client.sessions_get(&id("sessionId")).await),
        "sessions.update" => called(client.sessions_update(&id("sessionId"), &part(ex, "body")).await),
        "sessions.delete" => called(client.sessions_delete(&id("sessionId"), &part(ex, "body")).await),
        "tags.list" => called(client.tags_list().await),
        "tags.create" => called(client.tags_create(&part(ex, "body")).await),
        "tags.rename" => called(client.tags_rename(&id("tagId"), &part(ex, "body")).await),
        "tags.recategorize" => called(client.tags_recategorize(&id("tagId"), &part(ex, "body")).await),
        "tags.setDistractionClass" => called(client.tags_set_distraction_class(&id("tagId"), &part(ex, "body")).await),
        "tags.archive" => called(client.tags_archive(&id("tagId"), &part(ex, "body")).await),
        "tags.unarchive" => called(client.tags_unarchive(&id("tagId"), &part(ex, "body")).await),
        "tags.delete" => called(client.tags_delete(&id("tagId"), &part(ex, "body")).await),
        "goals.get" => called(client.goals_get().await),
        "goals.set" => called(client.goals_set(&part(ex, "body")).await),
        "preferences.get" => called(client.preferences_get().await),
        "preferences.update" => called(client.preferences_update(&part(ex, "body")).await),
        "push.registerToken" => called(client.push_register_token(&part(ex, "body")).await),
        "push.clearToken" => called(client.push_clear_token(&part(ex, "body")).await),
        "sync.getSnapshot" => called(client.sync_get_snapshot().await),
        "sync.listChanges" => {
            let cursor: Option<types::SyncListChangesCursor> = member(ex, "query", "cursor");
            called(client.sync_list_changes(cursor.as_ref(), member(ex, "query", "since")).await)
        }
        "appUpdates.getLatest" => called(client.app_updates_get_latest(member(ex, "query", "platform")).await),
        "health.get" => called(client.health_get().await),
        "health.live" => called(client.health_live().await),
        _ => return None,
    })
}

/// The method and path template the OpenAPI document gives `name` (`x-pulse-operation`).
fn route(openapi: &Value, name: &str) -> (String, String) {
    let paths = openapi["paths"].as_object().unwrap();
    paths
        .iter()
        .flat_map(|(path, item)| {
            item.as_object()
                .unwrap()
                .iter()
                .map(move |(method, operation)| (path, method, operation))
        })
        .find(|(_, _, operation)| operation["x-pulse-operation"] == name)
        .map(|(path, method, _)| (method.to_uppercase(), path.clone()))
        .unwrap_or_else(|| panic!("{name} has no route in openapi.json"))
}

fn expected_path(template: &str, params: Option<&Value>) -> String {
    support::http::as_url_values(params)
        .iter()
        .fold(template.to_owned(), |path, (key, value)| {
            path.replace(&format!("{{{key}}}"), value)
        })
}

/// Runs one operation through the client and the stub; returns what did not conform.
async fn check_operation(openapi: &Value, name: &str, example: &Value) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = Client::new_with_client(
        &format!("http://{}", listener.local_addr().unwrap()),
        reqwest::Client::new(),
    );
    let reply = Reply {
        status: if example.get("response").is_some() {
            200
        } else {
            204
        },
        body: example.get("response").cloned(),
    };
    let server = tokio::spawn(support::http::serve_once(listener, reply));
    let Some(outcome) = call(&client, name, example).await else {
        // No request was sent, so the stub would wait forever.
        server.abort();
        return Err(format!(
            "{name}: no Rust mapping in tests/operations.rs `call`"
        ));
    };
    let called = outcome.map_err(|error| format!("{name}: {error}"))?;
    let exchange: Exchange = server.await.unwrap();

    let (method, template) = route(openapi, name);
    let path = expected_path(&template, example.get("params"));
    let target_path = exchange.target.split('?').next().unwrap_or_default();
    if (exchange.method.as_str(), target_path) != (method.as_str(), path.as_str()) {
        return Err(format!(
            "{name}: sent {} {target_path}, expected {method} {path}",
            exchange.method
        ));
    }
    let (query, expected_query) = (
        support::http::query_of(&exchange.target),
        support::http::as_url_values(example.get("query")),
    );
    if query != expected_query {
        return Err(format!(
            "{name}: sent query {query:?}, expected {expected_query:?}"
        ));
    }
    if called.server_time.as_deref() != Some(support::http::SERVER_TIME) {
        return Err(format!(
            "{name}: Pulse-Server-Time not readable from the response"
        ));
    }

    match (example.get("body"), &exchange.body) {
        (Some(expected), Some(sent)) => {
            support::equivalent(expected, sent, &format!("{name}.body"))?;
        }
        (None, None) => {}
        (expected, sent) => {
            return Err(format!("{name}: body expected {expected:?}, sent {sent:?}"));
        }
    }
    let expected_response = example.get("response").cloned().unwrap_or(Value::Null);
    support::equivalent(
        &expected_response,
        &called.response,
        &format!("{name}.response"),
    )
}

#[tokio::test(flavor = "current_thread")]
async fn every_operation_example_round_trips_through_the_generated_client() {
    let (examples, openapi) = (support::examples(), support::openapi());
    let mut failures = Vec::new();

    for (name, example) in examples["operations"].as_object().unwrap() {
        if let Err(failure) = check_operation(&openapi, name, example).await {
            failures.push(failure);
        }
    }

    assert!(
        failures.is_empty(),
        "operations that do not conform:\n{}",
        failures.join("\n")
    );
}

#[test]
fn every_operation_in_the_openapi_document_has_an_example() {
    let (examples, openapi) = (support::examples(), support::openapi());

    let missing: Vec<&str> = openapi["paths"]
        .as_object()
        .unwrap()
        .values()
        .flat_map(|item| item.as_object().unwrap().values())
        .filter_map(|operation| operation["x-pulse-operation"].as_str())
        .filter(|name| examples["operations"].get(*name).is_none())
        .collect();

    assert!(
        missing.is_empty(),
        "operations without an example: {missing:?}"
    );
}

#[tokio::test(flavor = "current_thread")]
async fn an_error_response_decodes_into_the_error_body() {
    let examples = support::examples();
    let conflict = examples["errors"]
        .as_array()
        .unwrap()
        .iter()
        .find(|error| error["code"] == "CONFLICT")
        .cloned()
        .unwrap();
    let start: types::StartTimerRequest = part(&examples["operations"]["timer.start"], "body");
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = Client::new_with_client(
        &format!("http://{}", listener.local_addr().unwrap()),
        reqwest::Client::new(),
    );
    let reply = Reply {
        status: 409,
        body: Some(conflict.clone()),
    };

    let (_, result) = tokio::join!(
        support::http::serve_once(listener, reply),
        client.timer_start(&start)
    );

    let Err(Error::ErrorResponse(error)) = result else {
        panic!("expected an error response, got {result:?}");
    };
    assert_eq!(error.status().as_u16(), 409);
    let body = error.into_inner();
    assert_eq!(body.code, types::ErrorCode::Conflict);
    support::equivalent(&conflict, &serde_json::to_value(&body).unwrap(), "CONFLICT").unwrap();
}
