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

    let client = Client::new();
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
