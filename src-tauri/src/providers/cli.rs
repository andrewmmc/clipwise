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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ProviderType;

    fn make_cli_provider(command: Option<&str>, args: Vec<&str>) -> Provider {
        Provider {
            id: "test".into(),
            name: "Test CLI".into(),
            provider_type: ProviderType::Cli,
            endpoint: None,
            api_key: None,
            headers: serde_json::Map::new(),
            default_model: None,
            command: command.map(Into::into),
            args: args.iter().map(|s| s.to_string()).collect(),
        }
    }

    // ── extract_json ──────────────────────────────────────────────────────────

    #[test]
    fn test_extract_json_plain_object() {
        let s = r#"{"result": "hello"}"#;
        assert_eq!(extract_json(s), Some(r#"{"result": "hello"}"#));
    }

    #[test]
    fn test_extract_json_with_text_before() {
        let s = r#"Here is the output: {"result": "world"}"#;
        assert_eq!(extract_json(s), Some(r#"{"result": "world"}"#));
    }

    #[test]
    fn test_extract_json_with_text_after() {
        // rfind('}') finds the one at the end of the JSON object
        let s = r#"{"result": "world"} done."#;
        assert!(extract_json(s).is_some());
        let extracted = extract_json(s).unwrap();
        // Must start with '{' and end with '}'
        assert!(extracted.starts_with('{'));
        assert!(extracted.ends_with('}'));
    }

    #[test]
    fn test_extract_json_no_braces_returns_none() {
        assert_eq!(extract_json("no json here"), None);
    }

    #[test]
    fn test_extract_json_empty_string_returns_none() {
        assert_eq!(extract_json(""), None);
    }

    #[test]
    fn test_extract_json_only_opening_brace_returns_none() {
        // No closing brace → rfind('}') is None → None
        assert_eq!(extract_json("{ unclosed brace"), None);
    }

    #[test]
    fn test_extract_json_nested_object() {
        let s = r#"{"result": "ok", "meta": {"x": 1}}"#;
        let extracted = extract_json(s).unwrap();
        assert!(extracted.starts_with('{'));
        assert!(extracted.ends_with('}'));
        // Should be parseable as JSON
        assert!(serde_json::from_str::<serde_json::Value>(extracted).is_ok());
    }

    // ── call_cli ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_call_cli_missing_command_field() {
        let provider = make_cli_provider(None, vec![]);
        let result = call_cli(&provider, "test message").await;
        assert!(
            matches!(result, Err(crate::error::AppError::Config(_))),
            "expected Config error, got {:?}",
            result
        );
    }

    #[tokio::test]
    async fn test_call_cli_nonexistent_binary() {
        let provider = make_cli_provider(Some("__no_such_llm_binary_xyz__"), vec![]);
        let result = call_cli(&provider, "test").await;
        assert!(
            matches!(result, Err(crate::error::AppError::Llm(_))),
            "expected Llm error for missing binary, got {:?}",
            result
        );
    }

    #[tokio::test]
    async fn test_call_cli_success_with_valid_json_output() {
        // sh -c 'printf ...' <full_prompt_as_$0>
        // printf does not use positional args, so full_prompt is ignored
        let provider = make_cli_provider(
            Some("sh"),
            vec!["-c", r#"printf '{"result":"transformed text"}'"#],
        );
        let result = call_cli(&provider, "hello world").await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap()["result"], "transformed text");
    }

    #[tokio::test]
    async fn test_call_cli_non_zero_exit_returns_error() {
        let provider = make_cli_provider(Some("sh"), vec!["-c", "exit 1"]);
        let result = call_cli(&provider, "test").await;
        assert!(
            matches!(result, Err(crate::error::AppError::Llm(_))),
            "expected Llm error for non-zero exit, got {:?}",
            result
        );
    }

    #[tokio::test]
    async fn test_call_cli_empty_stdout_returns_error() {
        // exit 0 with no output
        let provider = make_cli_provider(Some("sh"), vec!["-c", "true"]);
        let result = call_cli(&provider, "test").await;
        assert!(
            matches!(result, Err(crate::error::AppError::Llm(_))),
            "expected Llm error for empty stdout, got {:?}",
            result
        );
    }

    #[tokio::test]
    async fn test_call_cli_non_json_output_returns_error() {
        let provider = make_cli_provider(Some("sh"), vec!["-c", "echo 'plain text output'"]);
        let result = call_cli(&provider, "test").await;
        assert!(result.is_err(), "expected error for non-JSON output");
    }

    #[tokio::test]
    async fn test_call_cli_json_with_preamble_is_extracted() {
        // Model outputs extra text before the JSON — extract_json should find it
        let provider = make_cli_provider(
            Some("sh"),
            vec!["-c", r#"printf 'Thinking...\n{"result":"extracted"}'"#],
        );
        let result = call_cli(&provider, "test").await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap()["result"], "extracted");
    }
}
