use crate::error::AppError;
use crate::models::{Provider, SYSTEM_PROMPT};
use reqwest::Client;
use serde_json::json;

pub async fn call_openai(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
) -> Result<serde_json::Value, AppError> {
    call_openai_with_client(provider, user_message, model, max_tokens, &Client::new()).await
}

pub async fn call_openai_with_client(
    provider: &Provider,
    user_message: &str,
    model: Option<&str>,
    max_tokens: u32,
    client: &Client,
) -> Result<serde_json::Value, AppError> {
    let endpoint = provider
        .endpoint
        .as_deref()
        .unwrap_or("https://api.openai.com/v1/chat/completions");
    let api_key = provider
        .api_key
        .as_deref()
        .ok_or_else(|| AppError::Config("OpenAI provider missing apiKey".into()))?;
    let model_name = model
        .or(provider.default_model.as_deref())
        .unwrap_or("gpt-4o");

    let body = json!({
        "model": model_name,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ]
    });

    let mut req = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    // Apply any custom headers from the provider config
    for (key, val) in &provider.headers {
        if let Some(v) = val.as_str() {
            req = req.header(key.as_str(), v);
        }
    }

    let resp = req.json(&body).send().await.map_err(AppError::Http)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Llm(format!("OpenAI HTTP {}: {}", status, body)));
    }

    let json: serde_json::Value = resp.json().await.map_err(AppError::Http)?;

    // Extract content from choices[0].message.content
    let content = json["choices"][0]["message"]["content"]
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
            id: "test-openai".into(),
            name: "Test OpenAI".into(),
            provider_type: ProviderType::OpenAI,
            endpoint: Some(format!("{}/v1/chat/completions", server_uri)),
            api_key: Some("test-key".into()),
            headers: serde_json::Map::new(),
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
    async fn test_missing_api_key_returns_config_error() {
        let mut provider = make_provider("http://localhost:9999");
        provider.api_key = None;
        let result = call_openai(&provider, "test", None, 1024).await;
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[tokio::test]
    async fn test_successful_response_returns_parsed_value() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body(r#"{"result": "refined text"}"#)),
            )
            .mount(&server)
            .await;

        let result =
            call_openai_with_client(&make_provider(&server.uri()), "hello", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap()["result"], "refined text");
    }

    #[tokio::test]
    async fn test_http_401_returns_llm_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&server)
            .await;

        let result = call_openai_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::Llm(_))));
        if let Err(AppError::Llm(msg)) = result {
            assert!(
                msg.contains("401"),
                "error message should include status code"
            );
        }
    }

    #[tokio::test]
    async fn test_http_500_returns_llm_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500).set_body_string("Internal Server Error"))
            .mount(&server)
            .await;

        let result = call_openai_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::Llm(_))));
    }

    #[tokio::test]
    async fn test_http_429_returns_llm_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(429).set_body_string("Rate limited"))
            .mount(&server)
            .await;

        let result = call_openai_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::Llm(_))));
    }

    #[tokio::test]
    async fn test_empty_choices_returns_invalid_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"choices": []})),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::InvalidResponse)));
    }

    #[tokio::test]
    async fn test_non_json_message_content_returns_invalid_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(success_body("this is plain text, not json")),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(matches!(result, Err(AppError::InvalidResponse)));
    }

    #[tokio::test]
    async fn test_model_override_is_sent_in_request_body() {
        let server = MockServer::start().await;
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
        let server = MockServer::start().await;
        // Default model is "gpt-4o" — verify it appears in the request body
        Mock::given(method("POST"))
            .and(body_string_contains("gpt-4o"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let provider = make_provider(&server.uri()); // no default_model set
        let result = call_openai_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(result.is_ok(), "expected Ok when falling back to gpt-4o");
    }

    #[tokio::test]
    async fn test_provider_default_model_used_when_no_override() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(body_string_contains("gpt-4-custom"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider.default_model = Some("gpt-4-custom".into());
        let result = call_openai_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(
            result.is_ok(),
            "expected Ok when using provider default model"
        );
    }

    #[tokio::test]
    async fn test_authorization_header_is_sent() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("authorization", "Bearer test-key"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let result = call_openai_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(
            result.is_ok(),
            "expected Ok when authorization header matches"
        );
    }

    #[tokio::test]
    async fn test_custom_headers_are_forwarded() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("x-custom-header", "my-value"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(success_body(r#"{"result": "ok"}"#)),
            )
            .mount(&server)
            .await;

        let mut provider = make_provider(&server.uri());
        provider.headers.insert(
            "x-custom-header".into(),
            serde_json::Value::String("my-value".into()),
        );
        let result = call_openai_with_client(&provider, "test", None, 1024, &no_proxy_client()).await;
        assert!(
            result.is_ok(),
            "expected Ok when custom header matches mock"
        );
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

        let result = call_openai_with_client(&make_provider(&server.uri()), "test", None, 1024, &no_proxy_client()).await;
        assert!(
            result.is_ok(),
            "system prompt must be included in request body"
        );
    }
}
