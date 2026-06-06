use crate::error::AppError;
use crate::llm_response::normalize_response_str;
use crate::models::Provider;
use crate::retry::with_http_retry;
use reqwest::{Client, RequestBuilder};
use serde_json::Value;
use std::time::Duration;
use tracing::{debug, warn};

const REQUEST_TIMEOUT_SECS: u64 = 120;

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
