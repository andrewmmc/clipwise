use crate::error::AppError;
use crate::llm_response::normalize_response_str;
use crate::models::Provider;
use crate::retry::with_http_retry;
use reqwest::{Client, RequestBuilder};
use serde_json::Value;
use std::time::Duration;
use tracing::{debug, warn};

const REQUEST_TIMEOUT_SECS: u64 = 120;

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
            .map_err(AppError::Http)?;
        let status = response.status();

        if !status.is_success() {
            warn!(
                provider_id = %provider.id,
                status = status.as_u16(),
                provider = provider_name,
                "Provider request failed"
            );
            let error_body = response.text().await.unwrap_or_default();
            return Err(AppError::from_http_status(status.as_u16(), &error_body));
        }

        debug!(
            provider_id = %provider.id,
            status = status.as_u16(),
            provider = provider_name,
            "Provider request succeeded"
        );
        response.text().await.map_err(AppError::Http)
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

    let json: Value = serde_json::from_str(&body_text)
        .map_err(|_| AppError::Llm(format!("Failed to parse response as JSON: {}", body_text)))?;
    let content = extract_content(&json)?;
    normalize_response_str(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Provider, ProviderHeaders, ProviderType};

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
}
