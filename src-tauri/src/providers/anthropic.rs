use crate::error::AppError;
use crate::models::{Provider, SYSTEM_PROMPT};
use crate::providers::http::{
    endpoint_or_default, model_or_default, provider_api_key, secure_provider_client,
    send_json_and_normalize, validate_provider_endpoint,
};
use reqwest::Client;
use serde_json::json;
use tracing::info;

const DEFAULT_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL: &str = "claude-sonnet-5-5";

pub async fn call_anthropic(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
) -> Result<serde_json::Value, AppError> {
    validate_provider_endpoint(provider)?;
    let client = secure_provider_client()?;
    call_anthropic_with_client(provider, user_message, model, max_tokens, &client).await
}

pub async fn call_anthropic_with_client(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
    client: &Client,
) -> Result<serde_json::Value, AppError> {
    let endpoint = endpoint_or_default(provider, DEFAULT_ENDPOINT);
    let api_key = provider_api_key(provider, "Anthropic")?;
    let model_name = model_or_default(model, provider, DEFAULT_MODEL);

    info!(
        provider_id = %provider.id,
        model = %model_name,
        max_tokens,
        prompt_chars = user_message.chars().count(),
        has_custom_endpoint = provider.endpoint.is_some(),
        header_count = provider.headers.len(),
        "Calling Anthropic provider"
    );

    let body = json!({
        "model": model_name,
        "max_tokens": max_tokens,
        "system": SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": user_message}
        ]
    });

    send_json_and_normalize(
        client,
        provider,
        "Anthropic",
        endpoint,
        &body,
        |client, endpoint| {
            client
                .post(endpoint)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
        },
        |json| {
            match json["stop_reason"].as_str() {
                Some("max_tokens") => return Err(AppError::Llm(
                    "Response reached the token limit. Increase Max tokens in Settings; thinking also uses this budget.".into(),
                )),
                Some("model_context_window_exceeded") => return Err(AppError::Llm(
                    "Response exceeded the model's context window. Try shorter input text.".into(),
                )),
                Some("refusal") => return Err(AppError::Llm("Claude declined this request.".into())),
                _ => {}
            }
            let blocks = json.get("content")
                .and_then(serde_json::Value::as_array)
                .ok_or(AppError::InvalidResponse)?;
            // Thinking (including redacted thinking) may precede the answer.
            // Only text blocks belong in the clipboard result.
            let mut text = String::new();
            for block in blocks.iter().filter(|block| block["type"] == "text") {
                text.push_str(block["text"].as_str().ok_or(AppError::InvalidResponse)?);
            }
            if text.trim().is_empty() {
                return Err(AppError::InvalidResponse);
            }
            Ok(text)
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ProviderHeaders, ProviderType};
    use crate::providers::test_helpers::{no_proxy_client, start_mock_server_or_skip};
    use wiremock::matchers::{body_string_contains, header, method, path};
    use wiremock::{Mock, ResponseTemplate};

    fn make_provider(server_uri: &str) -> Provider {
        Provider {
            id: "test-anthropic".into(),
            name: "Test Anthropic".into(),
            provider_type: ProviderType::Anthropic,
            endpoint: Some(format!("{}/v1/messages", server_uri)),
            api_key: Some("test-key".into()),
            headers: ProviderHeaders::new(),
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
    async fn test_current_models_extract_text_after_thinking() {
        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(header("anthropic-version", "2023-06-01"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "stop_reason": "end_turn",
                "content": [
                    {"type": "thinking", "thinking": "private reasoning", "signature": "test"},
                    {"type": "redacted_thinking", "data": "opaque"},
                    {"type": "text", "text": "{\"result\":\""},
                    {"type": "text", "text": "final answer\"}"}
                ]
            })))
            .mount(&server)
            .await;
        let models = [
            "claude-sonnet-5-5",
            "claude-opus-5-5",
            "claude-fable-5-1",
            "claude-haiku-4-5",
        ];
        let mut provider = make_provider(&server.uri());
        provider.default_model = Some("older-model".into());
        for model in models {
            let result = call_anthropic_with_client(
                &provider,
                "hello",
                Some(model),
                4096,
                &no_proxy_client(),
            )
            .await
            .unwrap();
            assert_eq!(result, json!({"result": "final answer"}));
        }
        let requests = server.received_requests().await.unwrap();
        assert_eq!(requests.len(), models.len());
        for (request, model) in requests.iter().zip(models) {
            let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap();
            assert_eq!(body["model"], model);
            assert_eq!(body["max_tokens"], 4096);
            assert_eq!(body["system"], SYSTEM_PROMPT);
        }
    }

    #[tokio::test]
    async fn test_thinking_only_or_malformed_text_is_not_an_answer() {
        let server = wiremock::MockServer::start().await;
        for content in [
            json!([{"type": "thinking", "thinking": "private", "text": "not an answer"}]),
            json!([{"type": "text", "text": 42}]),
            json!([{"type": "text", "text": ""}]),
        ] {
            server.reset().await;
            Mock::given(method("POST"))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_json(json!({"content": content, "stop_reason": "end_turn"})),
                )
                .mount(&server)
                .await;
            let result = call_anthropic_with_client(
                &make_provider(&server.uri()),
                "hello",
                None,
                4096,
                &no_proxy_client(),
            )
            .await;
            assert!(matches!(result, Err(AppError::InvalidResponse)));
        }
    }

    #[tokio::test]
    async fn test_incomplete_and_refused_responses_are_not_clipboard_results() {
        let server = wiremock::MockServer::start().await;
        for (stop_reason, expected) in [
            ("max_tokens", "token limit"),
            ("model_context_window_exceeded", "context window"),
            ("refusal", "declined"),
        ] {
            server.reset().await;
            let mut response = success_body(r#"{"result":"partial"}"#);
            response["stop_reason"] = json!(stop_reason);
            Mock::given(method("POST"))
                .respond_with(ResponseTemplate::new(200).set_body_json(response))
                .expect(1)
                .mount(&server)
                .await;
            let error = call_anthropic_with_client(
                &make_provider(&server.uri()),
                "hello",
                None,
                4096,
                &no_proxy_client(),
            )
            .await
            .unwrap_err();
            assert!(error.to_string().contains(expected));
            assert!(!error.is_retryable());
            server.verify().await;
        }
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
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body(r#"{"result": "improved text"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "hello",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap()["result"], "improved text");
    }

    #[tokio::test]
    async fn test_http_401_returns_llm_error() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(matches!(result, Err(AppError::AuthError)));
    }

    #[tokio::test]
    async fn test_http_429_rate_limit_returns_llm_error() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(429).set_body_string("Rate limited"))
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(matches!(result, Err(AppError::RateLimited)));
    }

    #[tokio::test]
    async fn test_http_500_returns_llm_error() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500).set_body_string("Server Error"))
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(matches!(result, Err(AppError::Llm(_))));
        let message = result.unwrap_err().to_string();
        assert!(message.contains("500"));
        assert!(!message.contains("Server Error"));
    }

    #[tokio::test]
    async fn test_empty_content_array_returns_invalid_response() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"content": []})),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(matches!(result, Err(AppError::InvalidResponse)));
    }

    #[tokio::test]
    async fn test_non_json_text_returns_invalid_response() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body("this is plain text, not JSON")),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(
            result.is_ok(),
            "expected plain text content to be normalized"
        );
        assert_eq!(result.unwrap()["result"], "this is plain text, not JSON");
    }

    #[tokio::test]
    async fn test_text_with_json_preamble_is_normalized() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body(r#"Result: {"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(result.is_ok(), "expected embedded JSON to be normalized");
        assert_eq!(result.unwrap()["result"], "ok");
    }

    #[tokio::test]
    async fn test_model_override_is_sent_in_request_body() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
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
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(body_string_contains("claude-sonnet-5-5"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(
            result.is_ok(),
            "expected Ok when falling back to claude-sonnet"
        );
    }

    #[tokio::test]
    async fn test_provider_default_model_used_when_no_override() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(body_string_contains("claude-3-opus"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider.default_model = Some("claude-3-opus".into());
        let result =
            call_anthropic_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_x_api_key_header_is_sent() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(header("x-api-key", "test-key"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(result.is_ok(), "x-api-key header must be sent");
    }

    #[tokio::test]
    async fn test_anthropic_version_header_is_sent() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(header("anthropic-version", "2023-06-01"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(result.is_ok(), "anthropic-version header must be sent");
    }

    #[tokio::test]
    async fn test_custom_headers_are_forwarded() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(header("x-org-id", "org-123"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider.headers.insert("x-org-id".into(), "org-123".into());
        let result =
            call_anthropic_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "custom header must be forwarded");
    }

    #[tokio::test]
    async fn test_system_prompt_is_included_in_request() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(body_string_contains("text transformation assistant"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_anthropic_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(result.is_ok(), "system prompt must appear in request body");
    }
}
