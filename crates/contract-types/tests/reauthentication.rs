//! Re-authentication for email change and account deletion (D-31): by password, or by Google
//! with the same credential as Google sign-in, an ID token (Android) or an authorization code
//! with its PKCE verifier (Windows). The examples only show the password form, so these tests
//! pin every form in the generated Rust type, both ways.
#![cfg(test)]

mod support;

use pulse_contract_types::types::{GoogleCredential, Reauthentication};
use serde_json::{Value, json};

/// Decodes `wire` as `Reauthentication`, re-encodes it, checks the JSON is unchanged and returns
/// the decoded value.
fn round_trip(wire: &Value) -> Reauthentication {
    let decoded: Reauthentication = serde_json::from_value(wire.clone()).unwrap();
    let encoded = serde_json::to_value(&decoded).unwrap();
    support::equivalent(wire, &encoded, "reauthentication").unwrap();
    decoded
}

#[test]
fn a_password_reauthentication_round_trips() {
    let wire = json!({ "method": "password", "password": "correct horse battery" });

    let decoded = round_trip(&wire);

    assert!(matches!(decoded, Reauthentication::Password { .. }));
}

#[test]
fn a_google_id_token_reauthentication_round_trips() {
    let wire = json!({
        "method": "google",
        "credential": { "kind": "idToken", "idToken": "example-id-token" },
    });

    let decoded = round_trip(&wire);

    assert!(matches!(
        decoded,
        Reauthentication::Google {
            credential: GoogleCredential::IdToken { .. }
        }
    ));
}

#[test]
fn a_google_authorization_code_reauthentication_round_trips() {
    let wire = json!({
        "method": "google",
        "credential": {
            "kind": "authorizationCode",
            "code": "example-code",
            "codeVerifier": "a".repeat(43),
            "redirectUri": "http://127.0.0.1:53682/callback",
        },
    });

    let decoded = round_trip(&wire);

    assert!(matches!(
        decoded,
        Reauthentication::Google {
            credential: GoogleCredential::AuthorizationCode { .. }
        }
    ));
}

#[test]
fn the_former_bare_id_token_form_is_rejected() {
    let wire = json!({ "method": "google", "idToken": "example-id-token" });

    assert!(serde_json::from_value::<Reauthentication>(wire).is_err());
}

#[test]
fn a_credential_mixing_both_kinds_is_rejected() {
    let wire = json!({
        "method": "google",
        "credential": { "kind": "idToken", "idToken": "example-id-token", "code": "example-code" },
    });

    assert!(serde_json::from_value::<Reauthentication>(wire).is_err());
}
