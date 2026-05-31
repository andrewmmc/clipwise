use crate::error::AppError;
use crate::models::Provider;
use crate::retry::with_http_retry;
use reqwest::{Client, RequestBuilder};
use serde_json::Value;
use tracing::{debug, warn};

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
    headers: &serde_json::Map<String, Value>,
) -> RequestBuilder {
    for (key, value) in headers {
        if let Some(value) = value.as_str() {
            request = request.header(key.as_str(), value);
        }
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
        let response = request.json(body).send().await.map_err(AppError::Http)?;
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
