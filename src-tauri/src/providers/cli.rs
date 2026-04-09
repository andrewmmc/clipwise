use crate::error::AppError;
use crate::models::{Provider, SYSTEM_PROMPT};
use std::process::Stdio;
use tokio::process::Command;

pub async fn call_cli(
    provider: &Provider,
    user_message: &str,
) -> Result<serde_json::Value, AppError> {
    let command = provider
        .command
        .as_deref()
        .ok_or_else(|| AppError::Config("CLI provider missing command".into()))?;

    // Build full message: inject system prompt + user message
    let full_prompt = format!("{}\n\n{}", SYSTEM_PROMPT, user_message);

    let mut cmd = Command::new(command);
    cmd.args(&provider.args);
    cmd.arg(&full_prompt);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Llm(format!("Failed to spawn CLI '{}': {}", command, e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Llm(format!(
            "CLI exited with non-zero code: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout = stdout.trim();

    if stdout.is_empty() {
        return Err(AppError::Llm("CLI produced no output".into()));
    }

    // Try to extract JSON from stdout (strip any leading/trailing text)
    let json_str = extract_json(stdout)
        .ok_or_else(|| AppError::Llm(format!("CLI output is not valid JSON: {}", stdout)))?;

    serde_json::from_str(json_str).map_err(|_| AppError::InvalidResponse)
}

/// Finds the first {...} block in a string (handles models that add extra text).
fn extract_json(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end >= start {
        Some(&s[start..=end])
    } else {
        None
    }
}
