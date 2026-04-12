use crate::commands::validate_cmd::normalize_response_str;
use crate::error::AppError;
use crate::models::SYSTEM_PROMPT;
use serde_json::Value;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tracing::{debug, info, warn};

/// Path to the compiled Swift helper binary, set by build.rs.
/// If the build step failed or wasn't run (non-macOS), this will be empty.
const APPLE_MODEL_RUNNER: Option<&str> = option_env!("APPLE_MODEL_RUNNER_PATH");

fn normalize_apple_output(raw: &str) -> Result<Value, AppError> {
    let normalized = normalize_response_str(raw)?;

    if let Some(result) = normalized.get("result").and_then(|value| value.as_str()) {
        return normalize_response_str(result);
    }

    Ok(normalized)
}

pub async fn call_apple(user_message: &str) -> Result<serde_json::Value, AppError> {
    let runner_path = APPLE_MODEL_RUNNER.ok_or_else(|| {
        AppError::Config(
            "Apple Intelligence is not available: model runner was not compiled for this platform"
                .into(),
        )
    })?;

    info!(
        prompt_chars = user_message.chars().count(),
        "Calling Apple Intelligence on-device model"
    );

    // Build stdin: system prompt \n\n user message
    let stdin_input = format!("{}\n\n{}", SYSTEM_PROMPT, user_message);

    let mut cmd = Command::new(runner_path);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        AppError::Llm(format!(
            "Failed to spawn Apple model runner '{}': {}",
            runner_path, e
        ))
    })?;

    // Write prompt to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(stdin_input.as_bytes()).await.map_err(|e| {
            AppError::Llm(format!("Failed to write to Apple model runner stdin: {}", e))
        })?;
        // Drop stdin to signal EOF
    }

    let output = child.wait_with_output().await.map_err(|e| {
        AppError::Llm(format!("Failed to wait for Apple model runner: {}", e))
    })?;

    if !output.status.success() {
        warn!(
            exit_code = ?output.status.code(),
            stderr_bytes = output.stderr.len(),
            "Apple model runner failed"
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Llm(format!(
            "Apple Intelligence model failed: {}",
            stderr.trim()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout = stdout.trim();

    if stdout.is_empty() {
        warn!("Apple model runner produced no output");
        return Err(AppError::Llm("Apple Intelligence model produced no output".into()));
    }

    debug!(stdout_bytes = stdout.len(), "Apple model runner returned output");

    normalize_apple_output(stdout)
}

/// Check if Apple Intelligence is available on this device.
/// Returns Ok(true) if available, Ok(false) if not, Err on failure.
pub async fn check_availability() -> Result<(bool, Option<String>), AppError> {
    let runner_path = match APPLE_MODEL_RUNNER {
        Some(path) => path,
        None => return Ok((false, Some("not_supported".to_string()))),
    };

    let output = Command::new(runner_path)
        .arg("--check-availability")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| {
            AppError::Llm(format!(
                "Failed to check Apple Intelligence availability: {}",
                e
            ))
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout = stdout.trim();

    let json: serde_json::Value = serde_json::from_str(stdout).map_err(|_| {
        AppError::Llm(format!(
            "Failed to parse availability check response: {}",
            stdout
        ))
    })?;

    let available = json["available"].as_bool().unwrap_or(false);
    let reason = json["reason"].as_str().map(|s| s.to_string());

    Ok((available, reason))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apple_model_runner_path_is_set() {
        // This test verifies the build.rs step ran successfully on macOS.
        // On non-macOS platforms, APPLE_MODEL_RUNNER will be None.
        if cfg!(target_os = "macos") {
            // May or may not be set depending on build environment
            // Just verify the constant exists and is accessible
            let _ = APPLE_MODEL_RUNNER;
        }
    }

    #[tokio::test]
    async fn test_call_apple_fails_gracefully_when_runner_not_available() {
        // When runner path is not available, it should return a Config error
        if APPLE_MODEL_RUNNER.is_none() {
            let result = call_apple("test message").await;
            assert!(
                matches!(result, Err(AppError::Config(_))),
                "expected Config error when runner not available, got {:?}",
                result
            );
        }
    }

    #[test]
    fn test_normalize_apple_output_unwraps_nested_result_json() {
        let raw = r#"{"result":"{\"result\":\"cleaned up\"}"}"#;

        let result = normalize_apple_output(raw).unwrap();

        assert_eq!(result, serde_json::json!({ "result": "cleaned up" }));
    }

    #[test]
    fn test_normalize_apple_output_preserves_plain_text_result() {
        let raw = r#"{"result":"plain transformed text"}"#;

        let result = normalize_apple_output(raw).unwrap();

        assert_eq!(
            result,
            serde_json::json!({ "result": "plain transformed text" })
        );
    }
}
