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

    let client = Client::new();
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

    let json: serde_json::Value = resp.json().await.map_err(AppError::Http)?;

    // Extract content from content[0].text
    let content = json["content"][0]["text"]
        .as_str()
        .ok_or(AppError::InvalidResponse)?;

    serde_json::from_str(content).map_err(|_| AppError::InvalidResponse)
}
