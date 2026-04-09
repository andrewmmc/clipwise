use crate::error::AppError;
use crate::models::{Provider, SYSTEM_PROMPT};
use reqwest::Client;
use serde_json::json;

pub async fn call_anthropic(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
) -> Result<serde_json::Value, AppError> {
    call_anthropic_with_client(provider, user_message, model, max_tokens, &Client::new()).await
}

pub async fn call_anthropic_with_client(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
    client: &Client,
) -> Result<serde_json::Value, AppError> {
    let endpoint = provider
        .endpoint
        .as_deref()
        .unwrap_or("https://api.anthropic.com/v1/messages");
    let api_key = provider
        .api_key
        .as_deref()
        .ok_or_else(|| AppError::Config("Anthropic provider missing apiKey".into()))?;
    let model_name = model
        .or(provider.default_model.as_deref())
        .unwrap_or("claude-sonnet-4-20250514");

    let body = json!({
        "model": model_name,
        "max_tokens": max_tokens,
        "system": SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": user_message}
        ]
    });

    let mut req = client
        .post(endpoint)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json");

    for (key, val) in &provider.headers {
        if let Some(v) = val.as_str() {
            req = req.header(key.as_str(), v);
        }
    }

    let resp = req.json(&body).send().await.map_err(AppError::Http)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Llm(format!(
            "Anthropic HTTP {}: {}",
            status, body
        )));
    }

    let body_text = resp
        .text()
        .await
        .map_err(AppError::Http)?;
    let json: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|_| AppError::Llm(format!("Failed to parse response as JSON: {}", body_text)))?;

    // Extract content from content[0].text
    let content = json["content"][0]["text"]
        .as_str()
        .ok_or(AppError::InvalidResponse)?;

    serde_json::from_str(content).map_err(|_| AppError::InvalidResponse)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ProviderType;
    use wiremock::matchers::{body_string_contains, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn no_proxy_client() -> Client {
        Client::builder().no_proxy().build().unwrap()
    }

    fn make_provider(server_uri: &str) -> Provider {
        Provider {
            id: "test-anthropic".into(),
            name: "Test Anthropic".into(),
            provider_type: ProviderType::Anthropic,
            endpoint: Some(format!("{}/v1/messages", server_uri)),
            api_key: Some("test-key".into()),
            headers: serde_json::Map::new(),
            default_model: None,
            command: None,
            args: vec![],
        }
    }

    fn success_body(text: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "msg_test",
            "type": "message",
            "role": "assistant",
            "content": [{ "type": "text", "text": text }],
            "model": "claude-sonnet-4-20250514",
            "stop_reason": "end_turn"
        })
    }

    #[tokio::test]
    async fn test_missing_api_key_returns_config_error() {
        let mut provider = make_provider("http://localhost:9999");
        provider.api_key = None;
        let result = call_anthropic(&provider, "test", None, 1024).await;
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[tokio::test]
    async fn test_successful_response_returns_parsed_value() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body(r#"{"result": "improved text"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "hello", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap()["result"], "improved text");
    }

    #[tokio::test]
    async fn test_http_401_returns_llm_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::Llm(_))));
        if let Err(AppError::Llm(msg)) = result {
            assert!(msg.contains("401"));
        }
    }

    #[tokio::test]
    async fn test_http_429_rate_limit_returns_llm_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(429).set_body_string("Rate limited"))
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::Llm(_))));
    }

    #[tokio::test]
    async fn test_http_500_returns_llm_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500).set_body_string("Server Error"))
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::Llm(_))));
    }

    #[tokio::test]
    async fn test_empty_content_array_returns_invalid_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"content": []})),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::InvalidResponse)));
    }

    #[tokio::test]
    async fn test_non_json_text_returns_invalid_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body("this is plain text, not JSON")),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::InvalidResponse)));
    }

    #[tokio::test]
    async fn test_model_override_is_sent_in_request_body() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(body_string_contains("claude-3-haiku"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            Some("claude-3-haiku"),
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_falls_back_to_claude_sonnet_when_no_model_set() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(body_string_contains("claude-sonnet-4-20250514"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(
            result.is_ok(),
            "expected Ok when falling back to claude-sonnet"
        );
    }

    #[tokio::test]
    async fn test_provider_default_model_used_when_no_override() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(body_string_contains("claude-3-opus"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider.default_model = Some("claude-3-opus".into());
        let result = call_anthropic_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_x_api_key_header_is_sent() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("x-api-key", "test-key"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "x-api-key header must be sent");
    }

    #[tokio::test]
    async fn test_anthropic_version_header_is_sent() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("anthropic-version", "2023-06-01"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "anthropic-version header must be sent");
    }

    #[tokio::test]
    async fn test_custom_headers_are_forwarded() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("x-org-id", "org-123"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider.headers.insert(
            "x-org-id".into(),
            serde_json::Value::String("org-123".into()),
        );
        let result = call_anthropic_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "custom header must be forwarded");
    }

    #[tokio::test]
    async fn test_system_prompt_is_included_in_request() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(body_string_contains("text transformation assistant"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "system prompt must appear in request body");
    }
}
