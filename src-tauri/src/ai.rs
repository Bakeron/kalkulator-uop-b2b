//! "Sprawdź przepisy z AI" (assumption A4): one question to Claude Sonnet 5.5 with web search,
//! asked only when the user clicks. The key is read from the vault here and never reaches the web
//! view. The page builds the question (only the rates and acts - nothing about the user), checks
//! the answer and keeps the spending counter; this module only carries the question and fetches
//! official sources so the page can check the quoted numbers.

use std::time::Duration;

use reqwest::{Client, Response, redirect};
use serde::Serialize;
use serde_json::{Value, json};

use crate::secrets;

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-sonnet-5-5";
/// No answer or source page is ever this big - anything larger is refused.
const MAX_BODY: usize = 8 * 1024 * 1024;
/// A server tool loop may pause ("pause_turn"); it is resumed at most this many times.
const MAX_ROUNDS: usize = 4;
const MAX_SYSTEM: usize = 50_000;
const MAX_QUESTION: usize = 200_000;

/// An error for the page: `kind` picks the message and the advice shown to the user.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AiError {
    /// "nokey", "key", "funds", "busy", "overloaded", "offline", "timeout", "server",
    /// "source", "vault", "format", "other".
    pub kind: &'static str,
    pub message: String,
}

impl AiError {
    pub fn new(kind: &'static str, message: impl Into<String>) -> Self {
        let message: String = message.into();
        Self { kind, message: message.chars().take(500).collect() }
    }
}

/// What one check cost and what Claude wrote.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub text: String,
    /// The model that answered (a safety fallback may answer instead of the one asked).
    pub model: String,
    pub stop_reason: String,
    pub input: i64,
    pub output: i64,
    pub cache_read: i64,
    pub cache_write: i64,
    pub searches: i64,
}

fn net_error(e: reqwest::Error) -> AiError {
    if e.is_timeout() {
        AiError::new("timeout", e.to_string())
    } else if e.is_connect() || e.is_request() {
        AiError::new("offline", e.to_string())
    } else {
        AiError::new("other", e.to_string())
    }
}

fn client(timeout: Duration, official_only: bool) -> Result<Client, AiError> {
    let builder = Client::builder();
    #[cfg(target_os = "android")]
    let builder = builder.tls_backend_preconfigured(crate::tls::http_config().map_err(|e| AiError::new("other", e))?);
    let policy = if official_only {
        // A source page may redirect only to another official page.
        redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !official(attempt.url().as_str()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        })
    } else {
        redirect::Policy::none()
    };
    builder
        .user_agent(concat!("KalkulatorUoPB2B/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(timeout)
        .redirect(policy)
        .build()
        .map_err(|e| AiError::new("other", e.to_string()))
}

async fn read_limited(mut resp: Response) -> Result<Vec<u8>, AiError> {
    if resp.content_length().is_some_and(|len| len as usize > MAX_BODY) {
        return Err(AiError::new("other", "the answer is too big"));
    }
    let mut body = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(net_error)? {
        if body.len() + chunk.len() > MAX_BODY {
            return Err(AiError::new("other", "the answer is too big"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// The kind of an error answer of the Anthropic API.
pub fn api_error(status: u16, body: &str) -> AiError {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.pointer("/error/message").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| body.chars().take(300).collect());
    let lower = body.to_lowercase();
    let kind = if lower.contains("credit balance") || lower.contains("billing") {
        "funds"
    } else {
        match status {
            401 | 403 => "key",
            429 => "busy",
            529 => "overloaded",
            500..=599 => "server",
            _ if lower.contains("overloaded") => "overloaded",
            _ => "other",
        }
    };
    AiError::new(kind, message)
}

fn add_usage(answer: &mut Answer, usage: Option<&Value>) {
    let Some(u) = usage else { return };
    let n = |path: &str| u.pointer(path).and_then(Value::as_i64).unwrap_or(0).max(0);
    answer.input += n("/input_tokens");
    answer.output += n("/output_tokens");
    answer.cache_read += n("/cache_read_input_tokens");
    answer.cache_write += n("/cache_creation_input_tokens");
    answer.searches += n("/server_tool_use/web_search_requests");
}

fn texts(content: &[Value]) -> Vec<String> {
    content
        .iter()
        .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|b| b.get("text").and_then(Value::as_str).map(str::to_string))
        .collect()
}

#[tauri::command]
pub async fn ai_ask(system: String, question: String) -> Result<Answer, AiError> {
    if system.len() > MAX_SYSTEM || question.len() > MAX_QUESTION || question.trim().is_empty() {
        return Err(AiError::new("other", "the question is too long or empty"));
    }
    let key = secrets::get()?.ok_or_else(|| AiError::new("nokey", "no API key"))?;
    // Web search and reading acts take time - minutes, not seconds.
    let http = client(Duration::from_secs(300), false)?;
    let mut messages = vec![json!({ "role": "user", "content": question })];
    let mut answer = Answer::default();
    let mut text = Vec::new();
    for _ in 0..MAX_ROUNDS {
        let body = json!({
            "model": MODEL,
            "max_tokens": 16000,
            "system": system,
            "messages": messages,
            "tools": [
                { "type": "web_search_20260209", "name": "web_search", "max_uses": 6 },
                { "type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 6, "max_content_tokens": 30000 },
            ],
            "output_config": { "effort": "medium" },
            // A safety decline is retried on a fallback model chosen by the API.
            "fallbacks": "default",
        });
        let resp = http
            .post(API_URL)
            .header("x-api-key", &key)
            .header("anthropic-version", "2026-10-21")
            .header("anthropic-beta", "server-side-fallback-2026-07-01")
            .json(&body)
            .send()
            .await
            .map_err(net_error)?;
        let status = resp.status().as_u16();
        let raw = read_limited(resp).await?;
        let raw = String::from_utf8_lossy(&raw);
        if !(200..300).contains(&status) {
            return Err(api_error(status, &raw));
        }
        let v: Value = serde_json::from_str(&raw).map_err(|e| AiError::new("other", format!("unexpected answer: {e}")))?;
        add_usage(&mut answer, v.get("usage"));
        if let Some(model) = v.get("model").and_then(Value::as_str) {
            answer.model = model.chars().take(120).collect();
        }
        let content = v.get("content").and_then(Value::as_array).cloned().unwrap_or_default();
        text.extend(texts(&content));
        answer.stop_reason = v.get("stop_reason").and_then(Value::as_str).unwrap_or("").to_string();
        if answer.stop_reason != "pause_turn" {
            break;
        }
        // The server paused its search loop: send its turn back and it goes on where it stopped.
        messages.push(json!({ "role": "assistant", "content": content }));
    }
    answer.text = text.join("\n");
    Ok(answer)
}

/// Official sources only (assumption A4): the Journal of Laws, Monitor Polski, ISAP, the Sejm,
/// gov.pl, ZUS, GUS and the President's site.
pub fn official(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default().to_ascii_lowercase();
    if host.contains(['@', ':']) {
        return false;
    }
    ["gov.pl", "zus.pl", "prezydent.pl"].iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

/// A source page as text with its content type - the page checks the quoted number in it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub text: String,
    pub content_type: String,
}

#[tauri::command]
pub async fn ai_fetch_source(url: String) -> Result<Source, AiError> {
    if url.len() > 500 || !official(&url) {
        return Err(AiError::new("source", "not an official source"));
    }
    let resp = client(Duration::from_secs(30), true)?
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5")
        .send()
        .await
        .map_err(net_error)?;
    let status = resp.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(AiError::new("source", format!("HTTP {status}")));
    }
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .chars()
        .take(100)
        .collect();
    let body = read_limited(resp).await?;
    Ok(Source { text: String::from_utf8_lossy(&body).into_owned(), content_type })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_official_sources_are_fetched() {
        assert!(official("https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20250001242"));
        assert!(official("https://api.sejm.gov.pl/eli/acts/DU/2026/1541/text.html"));
        assert!(official("https://www.gov.pl/web/finanse"));
        assert!(official("https://www.zus.pl/baza-wiedzy"));
        assert!(official("https://stat.gov.pl/"));
        assert!(official("https://www.prezydent.pl/prawo/ustawy"));
        // Not official, not https, or a trick with the host.
        assert!(!official("https://www.infor.pl/prawo/"));
        assert!(!official("http://isap.sejm.gov.pl/"));
        assert!(!official("https://notgov.pl/"));
        assert!(!official("https://gov.pl.evil.com/"));
        assert!(!official("https://user@evil.com/gov.pl"));
        assert!(!official("https://evil.com:443@gov.pl/"));
    }

    #[test]
    fn error_answers_are_named() {
        let key = r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#;
        assert_eq!(api_error(401, key), AiError::new("key", "invalid x-api-key"));
        let funds = r#"{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}"#;
        assert_eq!(api_error(400, funds).kind, "funds");
        assert_eq!(api_error(429, r#"{"error":{"message":"rate limit"}}"#).kind, "busy");
        assert_eq!(api_error(529, r#"{"error":{"type":"overloaded_error","message":"Overloaded"}}"#).kind, "overloaded");
        assert_eq!(api_error(500, "<html>").kind, "server");
        assert_eq!(api_error(400, r#"{"error":{"message":"bad"}}"#).kind, "other");
    }

    #[test]
    fn usage_adds_up_over_rounds() {
        let mut a = Answer::default();
        let u = json!({ "input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 10,
            "cache_creation_input_tokens": 5, "server_tool_use": { "web_search_requests": 3 } });
        add_usage(&mut a, Some(&u));
        add_usage(&mut a, Some(&json!({ "input_tokens": 1, "output_tokens": -4 })));
        assert_eq!((a.input, a.output, a.cache_read, a.cache_write, a.searches), (101, 50, 10, 5, 3));
    }
}
