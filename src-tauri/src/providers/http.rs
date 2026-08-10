use crate::error::AppError;
use crate::llm_response::normalize_response_str;
use crate::models::Provider;
use crate::retry::with_http_retry;
use reqwest::{Client, ClientBuilder, RequestBuilder};
use serde_json::Value;
use std::time::Duration;
use tracing::{debug, warn};

const REQUEST_TIMEOUT_SECS: u64 = 120;
const MAX_RESPONSE_BODY_BYTES: usize = 4 * 1024 * 1024;
const MAX_ERROR_BODY_BYTES: usize = 4 * 1024;

fn provider_client_builder(https_only: bool) -> ClientBuilder {
    Client::builder()
        .https_only(https_only)
        .redirect(reqwest::redirect::Policy::none())
}

/// Builds the client used for authenticated provider requests.
///
/// Provider API endpoints are expected to return JSON directly. Refusing all
/// redirects prevents API keys and custom headers from being forwarded to a
/// different origin or downgraded to plaintext HTTP.
pub(crate) fn secure_provider_client() -> Result<Client, AppError> {
    provider_client_builder(true)
        .build()
        .map_err(AppError::Http)
}

async fn read_body_limited(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<(String, bool), AppError> {
    let mut body = Vec::new();
    let mut truncated = false;

    while let Some(chunk) = response.chunk().await.map_err(AppError::Http)? {
        let remaining = max_bytes.saturating_sub(body.len());
        if chunk.len() > remaining {
            body.extend_from_slice(&chunk[..remaining]);
            truncated = true;
            break;
        }
        body.extend_from_slice(&chunk);
    }

    Ok((String::from_utf8_lossy(&body).into_owned(), truncated))
}

/// Validates a provider endpoint URL before it is used to send credentials.
///
/// IPC arguments are untrusted: the frontend `validateEndpoint` check is
/// trivially bypassed by invoking the Tauri commands directly or by hand-editing
/// `config.json`. Without this server-side check, the API key would be sent in an
/// `Authorization`/`x-api-key` header to an arbitrary host (including internal
/// addresses). We require `https` so credentials are never sent over plaintext or
/// a non-HTTP scheme.
pub(crate) fn validate_endpoint(endpoint: &str) -> Result<(), AppError> {
    let url = reqwest::Url::parse(endpoint)
        .map_err(|_| AppError::Config("Endpoint must be a valid https:// URL.".into()))?;
    if url.scheme() != "https" {
        return Err(AppError::Config(
            "Endpoint must be a valid https:// URL.".into(),
        ));
    }
    Ok(())
}

/// Validates a provider's configured endpoint, if any. An absent or empty
/// endpoint means "use the provider's built-in default", which is always https.
pub(crate) fn validate_provider_endpoint(provider: &Provider) -> Result<(), AppError> {
    if let Some(endpoint) = provider.endpoint.as_deref() {
        let trimmed = endpoint.trim();
        if !trimmed.is_empty() {
            validate_endpoint(trimmed)?;
        }
    }
    Ok(())
}

pub(crate) fn provider_api_key<'a>(
    provider: &'a Provider,
    provider_name: &str,
) -> Result<&'a str, AppError> {
    provider
        .api_key
        .as_deref()
        .ok_or_else(|| AppError::Config(format!("{provider_name} provider missing apiKey")))
}

pub(crate) fn model_or_default<'a>(
    action_model: Option<&'a str>,
    provider: &'a Provider,
    default_model: &'a str,
) -> &'a str {
    action_model
        .or(provider.default_model.as_deref())
        .unwrap_or(default_model)
}

pub(crate) fn endpoint_or_default<'a>(
    provider: &'a Provider,
    default_endpoint: &'a str,
) -> &'a str {
    provider
        .endpoint
        .as_deref()
        .map(str::trim)
        .filter(|endpoint| !endpoint.is_empty())
        .unwrap_or(default_endpoint)
}

pub(crate) fn apply_custom_headers(
    mut request: RequestBuilder,
    headers: &crate::models::ProviderHeaders,
) -> RequestBuilder {
    for (key, value) in headers {
        request = request.header(key.as_str(), value);
    }

    request
}

pub(crate) async fn send_json_with_retry(
    client: &Client,
    provider: &Provider,
    provider_name: &'static str,
    endpoint: &str,
    body: &Value,
    build_request: impl Fn(&Client, &str) -> RequestBuilder,
) -> Result<String, AppError> {
    let body_text = with_http_retry(|| async {
        let request = build_request(client, endpoint);
        let request = apply_custom_headers(request, &provider.headers);
        let response = request
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .json(body)
            .send()
            .await
            .map_err(AppError::from_request_error)?;
        let status = response.status();

        if !status.is_success() {
            warn!(
                provider_id = %provider.id,
                status = status.as_u16(),
                provider = provider_name,
                "Provider request failed"
            );
            let (mut error_body, truncated) = read_body_limited(response, MAX_ERROR_BODY_BYTES)
                .await
                .unwrap_or_default();
            if truncated {
                error_body.push_str("… [response truncated]");
            }
            return Err(AppError::from_http_status(status.as_u16(), &error_body));
        }

        debug!(
            provider_id = %provider.id,
            status = status.as_u16(),
            provider = provider_name,
            "Provider request succeeded"
        );
        let (body, truncated) = read_body_limited(response, MAX_RESPONSE_BODY_BYTES).await?;
        if truncated {
            return Err(AppError::Llm(format!(
                "{provider_name} response exceeded the {} MiB limit",
                MAX_RESPONSE_BODY_BYTES / (1024 * 1024)
            )));
        }
        Ok(body)
    })
    .await?;

    debug!(
        provider_id = %provider.id,
        response_bytes = body_text.len(),
        provider = provider_name,
        "Received provider response body"
    );

    Ok(body_text)
}

pub(crate) async fn send_json_and_normalize(
    client: &Client,
    provider: &Provider,
    provider_name: &'static str,
    endpoint: &str,
    body: &Value,
    build_request: impl Fn(&Client, &str) -> RequestBuilder,
    extract_content: impl FnOnce(&Value) -> Result<&str, AppError>,
) -> Result<Value, AppError> {
    let body_text = send_json_with_retry(
        client,
        provider,
        provider_name,
        endpoint,
        body,
        build_request,
    )
    .await?;

    let json: Value = serde_json::from_str(&body_text).map_err(|_| {
        AppError::Llm(format!(
            "{provider_name} returned a response that was not valid JSON"
        ))
    })?;
    let content = extract_content(&json)?;
    normalize_response_str(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Provider, ProviderHeaders, ProviderType};
    use crate::providers::test_helpers::{no_proxy_client, start_mock_server_or_skip};
    use wiremock::matchers::method;
    use wiremock::{Mock, ResponseTemplate};

    fn provider_with_endpoint(endpoint: Option<&str>) -> Provider {
        Provider {
            id: "p".into(),
            name: "P".into(),
            provider_type: ProviderType::OpenAI,
            endpoint: endpoint.map(str::to_string),
            api_key: Some("key".into()),
            headers: ProviderHeaders::new(),
            default_model: None,
            command: None,
            args: vec![],
        }
    }

    #[test]
    fn test_validate_endpoint_accepts_https() {
        assert!(validate_endpoint("https://api.openai.com/v1/chat/completions").is_ok());
    }

    #[test]
    fn test_validate_endpoint_rejects_http() {
        let err = validate_endpoint("http://api.openai.com/v1/chat/completions").unwrap_err();
        assert!(matches!(err, AppError::Config(_)));
    }

    #[test]
    fn test_validate_endpoint_rejects_non_http_schemes() {
        assert!(matches!(
            validate_endpoint("file:///etc/passwd").unwrap_err(),
            AppError::Config(_)
        ));
        assert!(matches!(
            validate_endpoint("ftp://example.com").unwrap_err(),
            AppError::Config(_)
        ));
    }

    #[test]
    fn test_validate_endpoint_rejects_garbage() {
        assert!(matches!(
            validate_endpoint("not a url").unwrap_err(),
            AppError::Config(_)
        ));
    }

    #[test]
    fn test_validate_endpoint_rejects_internal_http_address() {
        // SSRF target over plaintext must be blocked.
        assert!(matches!(
            validate_endpoint("http://169.254.169.254/latest/meta-data/").unwrap_err(),
            AppError::Config(_)
        ));
    }

    #[test]
    fn test_validate_provider_endpoint_allows_none() {
        assert!(validate_provider_endpoint(&provider_with_endpoint(None)).is_ok());
    }

    #[test]
    fn test_validate_provider_endpoint_allows_empty() {
        assert!(validate_provider_endpoint(&provider_with_endpoint(Some("  "))).is_ok());
    }

    #[test]
    fn test_validate_provider_endpoint_rejects_http() {
        assert!(matches!(
            validate_provider_endpoint(&provider_with_endpoint(Some("http://evil.example")))
                .unwrap_err(),
            AppError::Config(_)
        ));
    }

    #[test]
    fn test_validate_provider_endpoint_accepts_https() {
        assert!(validate_provider_endpoint(&provider_with_endpoint(Some(
            "https://proxy.example/v1"
        )))
        .is_ok());
    }

    #[test]
    fn test_endpoint_or_default_uses_default_for_blank_endpoint() {
        assert_eq!(
            endpoint_or_default(
                &provider_with_endpoint(Some("  ")),
                "https://default.example"
            ),
            "https://default.example"
        );
    }

    #[test]
    fn test_endpoint_or_default_trims_custom_endpoint() {
        assert_eq!(
            endpoint_or_default(
                &provider_with_endpoint(Some(" https://custom.example/v1 ")),
                "https://default.example"
            ),
            "https://custom.example/v1"
        );
    }

    #[tokio::test]
    async fn test_provider_client_does_not_follow_redirects() {
        let Some(source) = start_mock_server_or_skip().await else {
            return;
        };
        let Some(target) = start_mock_server_or_skip().await else {
            return;
        };

        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(307).insert_header("Location", target.uri().as_str()),
            )
            .expect(1)
            .mount(&source)
            .await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&target)
            .await;

        let mut provider = provider_with_endpoint(Some(&source.uri()));
        provider
            .headers
            .insert("X-Private-Token".into(), "header-secret".into());
        let client = provider_client_builder(false)
            .no_proxy()
            .build()
            .expect("test client should build");

        let result = send_json_with_retry(
            &client,
            &provider,
            "Test",
            &source.uri(),
            &serde_json::json!({}),
            |client, endpoint| {
                client
                    .post(endpoint)
                    .header("Authorization", "Bearer api-secret")
            },
        )
        .await;

        assert!(matches!(result, Err(AppError::Llm(message)) if message.contains("307")));
        source.verify().await;
        target.verify().await;
    }

    #[tokio::test]
    async fn test_send_json_rejects_oversized_success_body() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![
                b'x';
                MAX_RESPONSE_BODY_BYTES
                    + 1
            ]))
            .mount(&server)
            .await;
        let provider = provider_with_endpoint(Some(&server.uri()));
        let client = no_proxy_client();

        let result = send_json_with_retry(
            &client,
            &provider,
            "Test",
            &server.uri(),
            &serde_json::json!({}),
            |client, endpoint| client.post(endpoint),
        )
        .await;

        assert!(matches!(
            result,
            Err(AppError::Llm(message)) if message.contains("response exceeded")
        ));
    }

    #[tokio::test]
    async fn test_send_json_does_not_expose_oversized_error_body() {
        let Some(server) = start_mock_server_or_skip().await else {
            return;
        };
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(400).set_body_bytes(vec![b'x'; MAX_ERROR_BODY_BYTES + 1]),
            )
            .mount(&server)
            .await;
        let provider = provider_with_endpoint(Some(&server.uri()));
        let client = no_proxy_client();

        let error = send_json_with_retry(
            &client,
            &provider,
            "Test",
            &server.uri(),
            &serde_json::json!({}),
            |client, endpoint| client.post(endpoint),
        )
        .await
        .unwrap_err()
        .to_string();

        assert!(error.contains("400"));
        assert!(!error.contains("xxxxx"));
        assert!(error.len() < 100);
    }
}
