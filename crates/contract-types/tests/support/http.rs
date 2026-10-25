//! A one-request HTTP stub for the client conformance test, and the URL helpers it needs.

use std::collections::BTreeMap;

use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// The server time and request ID the stub sends, checked on the client side (ADR-0003).
pub const SERVER_TIME: &str = "2026-10-25T08:00:00.123Z";
pub const REQUEST_ID: &str = "conformance-request";

/// One HTTP request as the stub received it.
#[derive(Debug)]
pub struct Exchange {
    pub method: String,
    /// Path and query, as on the request line.
    pub target: String,
    pub body: Option<Value>,
}

/// What the stub answers: a status and an optional JSON body.
pub struct Reply {
    pub status: u16,
    pub body: Option<Value>,
}

/// Accepts one connection, reads one HTTP/1.1 request and answers `reply` with the contract's
/// response headers, then closes the connection.
pub async fn serve_once(listener: TcpListener, reply: Reply) -> Exchange {
    let (mut stream, _) = listener.accept().await.unwrap();
    let mut received = Vec::new();
    let mut chunk = [0_u8; 4096];
    let head_end = loop {
        let read = stream.read(&mut chunk).await.unwrap();
        assert!(read > 0, "connection closed before the request head ended");
        received.extend_from_slice(&chunk[..read]);
        if let Some(index) = find(&received, b"\r\n\r\n") {
            break index + 4;
        }
    };
    let head = String::from_utf8(received[..head_end].to_vec()).unwrap();
    let content_length =
        header(&head, "content-length").map_or(0, |value| value.parse::<usize>().unwrap());
    while received.len() < head_end + content_length {
        let read = stream.read(&mut chunk).await.unwrap();
        assert!(read > 0, "connection closed before the request body ended");
        received.extend_from_slice(&chunk[..read]);
    }
    let body = &received[head_end..head_end + content_length];

    let payload = reply
        .body
        .as_ref()
        .map(|body| serde_json::to_vec(body).unwrap())
        .unwrap_or_default();
    let content_type = if reply.body.is_some() {
        "Content-Type: application/json\r\n"
    } else {
        ""
    };
    let response = format!(
        "HTTP/1.1 {} Stub\r\n{content_type}Content-Length: {}\r\nPulse-Server-Time: {SERVER_TIME}\r\nPulse-Request-Id: {REQUEST_ID}\r\nConnection: close\r\n\r\n",
        reply.status,
        payload.len()
    );
    stream.write_all(response.as_bytes()).await.unwrap();
    stream.write_all(&payload).await.unwrap();
    stream.shutdown().await.unwrap();

    let mut request_line = head.lines().next().unwrap().split(' ');
    Exchange {
        method: request_line.next().unwrap().to_owned(),
        target: request_line.next().unwrap().to_owned(),
        body: (!body.is_empty()).then(|| serde_json::from_slice(body).unwrap()),
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn header<'a>(head: &'a str, name: &str) -> Option<&'a str> {
    head.lines()
        .filter_map(|line| line.split_once(':'))
        .find(|(key, _)| key.trim().eq_ignore_ascii_case(name))
        .map(|(_, value)| value.trim())
}

/// The query of a request target as name -> value.
pub fn query_of(target: &str) -> BTreeMap<String, String> {
    let url = reqwest::Url::parse(&format!("http://stub{target}")).unwrap();
    url.query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect()
}

/// An example object's members as they travel in a URL (`since=19`, `from=2026-10-19`).
pub fn as_url_values(example: Option<&Value>) -> BTreeMap<String, String> {
    let Some(Value::Object(members)) = example else {
        return BTreeMap::new();
    };
    members
        .iter()
        .map(|(key, value)| {
            let text = match value {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            };
            (key.clone(), text)
        })
        .collect()
}
