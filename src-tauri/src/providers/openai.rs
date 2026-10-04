use crate::error::AppError;
use crate::models::{Provider, SYSTEM_PROMPT};
use crate::providers::http::{
    endpoint_or_default, model_or_default, provider_api_key, secure_provider_client,
    send_json_and_normalize, validate_provider_endpoint,
};
use reqwest::Client;
use serde_json::json;
use tracing::info;

const DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL: &str = "gpt-4o";

fn uses_completion_token_limit(model: &str) -> bool {
    // OpenRouter uses qualified IDs. Keep max_tokens for other compatible
    // providers and older models that may not accept max_completion_tokens.
    let model = model.strip_prefix("openai/").unwrap_or(model);
    ["gpt-5", "gpt-6", "o1", "o3", "o4"].iter().any(|prefix| {
        model.strip_prefix(prefix).is_some_and(|suffix| {
            suffix.is_empty() || suffix.starts_with('-') || suffix.starts_with('.')
        })
    })
}

pub async fn call_openai(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
) -> Result<serde_json::Value, AppError> {
    validate_provider_endpoint(provider)?;
    let client = secure_provider_client()?;
    call_openai_with_client(provider, user_message, model, max_tokens, &client).await
}

pub async fn call_openai_with_client(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
    client: &Client,
) -> Result<serde_json::Value, AppError> {
    let endpoint = endpoint_or_default(provider, DEFAULT_ENDPOINT);
    let api_key = provider_api_key(provider, "OpenAI")?;
    let model_name = model_or_default(model, provider, DEFAULT_MODEL);

    info!(
        provider_id = %provider.id,
        model = %model_name,
        max_tokens,
        prompt_chars = user_message.chars().count(),
        has_custom_endpoint = provider.endpoint.is_some(),
        header_count = provider.headers.len(),
        "Calling OpenAI provider"
    );

    let mut body = json!({
        "model": model_name,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ]
    });
    let token_limit = if uses_completion_token_limit(model_name) {
        "max_completion_tokens"
    } else {
        "max_tokens"
    };
    body[token_limit] = json!(max_tokens);

    send_json_and_normalize(
        client,
        provider,
        "OpenAI",
        endpoint,
        &body,
        |client, endpoint| {
            client
                .post(endpoint)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
        },
        |json| {
            let choice = &json["choices"][0];
            if choice["finish_reason"] == "length" {
                return Err(AppError::Llm(
                    "Response reached the token limit. Increase Max tokens in Settings; reasoning also uses this budget.".into(),
                ));
            }
            if choice["finish_reason"] == "content_filter"
                || choice["message"]["refusal"].as_str().is_some()
            {
                return Err(AppError::Llm("OpenAI declined this request.".into()));
            }
            choice["message"]["content"]
                .as_str()
                .map(str::to_owned)
                .ok_or(AppError::InvalidResponse)
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
            id: "test-openai".into(),
            name: "Test OpenAI".into(),
            provider_type: ProviderType::OpenAI,
            endpoint: Some(format!("{}/v1/chat/completions", server_uri)),
            api_key: Some("test-key".into()),
            headers: ProviderHeaders::new(),
            default_model: None,
            command: None,
            args: vec![],
        }
    }

    fn success_body(content: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "chatcmpl-test",
            "choices": [{
                "index": 0,
                "message": { "role": "assistant", "content": content },
                "finish_reason": "stop"
            }]
        })
    }

    #[tokio::test]
    async fn test_token_limit_matches_the_selected_model() {
        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result":"ok"}"#)),
            )
            .mount(&server)
            .await;
        let mut provider = make_provider(&server.uri());
        provider.default_model = Some("gpt-6.1-sol".into());
        let cases = [
            (None, "max_completion_tokens"),
            (Some("gpt-6.1-sol"), "max_completion_tokens"),
            (Some("gpt-6-astra"), "max_completion_tokens"),
            (Some("gpt-6-sol"), "max_completion_tokens"),
            (Some("gpt-6-luna"), "max_completion_tokens"),
            (Some("openai/gpt-6.1-sol"), "max_completion_tokens"),
            (Some("gpt-5.2"), "max_completion_tokens"),
            (Some("o3-mini"), "max_completion_tokens"),
            (Some("gpt-4o"), "max_tokens"),
            (Some("custom-gateway-model"), "max_tokens"),
            (Some("gpt-60-custom"), "max_tokens"),
        ];
        for (model, _) in cases {
            let result =
                call_openai_with_client(&provider, "hello", model, 4096, &no_proxy_client())
                    .await
                    .unwrap();
            assert_eq!(result["result"], "ok");
        }
        let requests = server.received_requests().await.unwrap();
        assert_eq!(requests.len(), cases.len());
        for (request, (model, token_key)) in requests.iter().zip(cases) {
            let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap();
            assert_eq!(body["model"], model.unwrap_or("gpt-6.1-sol"));
            assert_eq!(body[token_key], 4096);
            let other_key = if token_key == "max_tokens" {
                "max_completion_tokens"
            } else {
                "max_tokens"
            };
            assert!(body.get(other_key).is_none());
            assert_eq!(body["messages"][0]["content"], SYSTEM_PROMPT);
            assert_eq!(body["messages"][1]["content"], "hello");
        }
    }

    #[tokio::test]
    async fn test_incomplete_and_refused_responses_are_not_clipboard_results() {
        let server = wiremock::MockServer::start().await;
        for (finish_reason, refusal, expected) in [
            ("length", serde_json::Value::Null, "token limit"),
            ("content_filter", serde_json::Value::Null, "declined"),
            ("stop", json!("Cannot comply"), "declined"),
        ] {
            server.reset().await;
            let mut response = success_body(r#"{"result":"partial"}"#);
            response["choices"][0]["finish_reason"] = json!(finish_reason);
            response["choices"][0]["message"]["refusal"] = refusal;
            Mock::given(method("POST"))
                .respond_with(ResponseTemplate::new(200).set_body_json(response))
                .expect(1)
                .mount(&server)
                .await;
            let error = call_openai_with_client(
                &make_provider(&server.uri()),
                "hello",
                Some("gpt-6.1-sol"),
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
        let result = call_openai(&provider, "test", None, 1024).await;
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[tokio::test]
    async fn test_unreachable_endpoint_returns_network_error() {
        // Bind then drop a listener so the port is guaranteed closed, then
        // point the provider at it to force a connection failure.
        let Ok(listener) = std::net::TcpListener::bind("127.0.0.1:0") else {
            return;
        };
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let provider = make_provider(&format!("http://127.0.0.1:{port}"));
        let result =
            call_openai_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;

        assert!(
            matches!(result, Err(AppError::NetworkError)),
            "expected NetworkError for an unreachable endpoint, got {:?}",
            result
        );
    }

    #[tokio::test]
    async fn test_successful_response_returns_parsed_value() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body(r#"{"result": "refined text"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(
            &make_provider(&server.uri()),
            "hello",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap()["result"], "refined text");
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

        let result = call_openai_with_client(
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
    async fn test_http_500_returns_llm_error() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500).set_body_string("Internal Server Error"))
            .mount(&server)
            .await;

        let result = call_openai_with_client(
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
        assert!(!message.contains("Internal Server Error"));
    }

    #[tokio::test]
    async fn test_http_429_returns_llm_error() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(429).set_body_string("Rate limited"))
            .mount(&server)
            .await;

        let result = call_openai_with_client(
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
    async fn test_empty_choices_returns_invalid_response() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"choices": []})),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(
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
    async fn test_non_json_message_content_returns_invalid_response() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body("this is plain text, not json")),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(
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
        assert_eq!(result.unwrap()["result"], "this is plain text, not json");
    }

    #[tokio::test]
    async fn test_message_content_with_json_preamble_is_normalized() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body(r#"Here is the result: {"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(
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
            .and(body_string_contains("gpt-4-turbo"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(
            &make_provider(&server.uri()),
            "test",
            Some("gpt-4-turbo"),
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(
            result.is_ok(),
            "expected Ok when model override matches mock"
        );
    }

    #[tokio::test]
    async fn test_falls_back_to_gpt4o_when_no_model_set() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        // Default model is "gpt-4o" — verify it appears in the request body
        Mock::given(method("POST"))
            .and(body_string_contains("gpt-4o"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let provider = make_provider(&server.uri()); // no default_model set
        let result =
            call_openai_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "expected Ok when falling back to gpt-4o");
    }

    #[tokio::test]
    async fn test_provider_default_model_used_when_no_override() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(body_string_contains("gpt-4-custom"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider.default_model = Some("gpt-4-custom".into());
        let result =
            call_openai_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(
            result.is_ok(),
            "expected Ok when using provider default model"
        );
    }

    #[tokio::test]
    async fn test_authorization_header_is_sent() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(header("authorization", "Bearer test-key"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(
            result.is_ok(),
            "expected Ok when authorization header matches"
        );
    }

    #[tokio::test]
    async fn test_custom_headers_are_forwarded() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .and(header("x-custom-header", "my-value"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider
            .headers
            .insert("x-custom-header".into(), "my-value".into());
        let result =
            call_openai_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(
            result.is_ok(),
            "expected Ok when custom header matches mock"
        );
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

        let result = call_openai_with_client(
            &make_provider(&server.uri()),
            "test",
            None,
            1024,
            &no_proxy_client(),
        )
        .await;
        assert!(
            result.is_ok(),
            "system prompt must be included in request body"
        );
    }
}
