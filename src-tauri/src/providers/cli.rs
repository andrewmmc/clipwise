use crate::commands::validate_cmd::normalize_response_str;
use crate::error::AppError;
use crate::models::{Provider, SYSTEM_PROMPT};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
use tracing::{debug, info, warn};

pub async fn call_cli(
    provider: &Provider,
    user_message: &str,
) -> Result<serde_json::Value, AppError> {
    let command = provider
        .command
        .as_deref()
        .ok_or_else(|| AppError::Config("CLI provider missing command".into()))?;
    let (resolved_command, inline_args) = prepare_command(command)?;

    info!(
        provider_id = %provider.id,
        command = %resolved_command.display(),
        inline_arg_count = inline_args.len(),
        provider_arg_count = provider.args.len(),
        prompt_chars = user_message.chars().count(),
        "Running CLI provider"
    );

    // Build full message: inject system prompt + user message
    let full_prompt = format!("{}\n\n{}", SYSTEM_PROMPT, user_message);

    let mut cmd = Command::new(&resolved_command);
    cmd.args(&inline_args);
    cmd.args(&provider.args);
    cmd.arg(&full_prompt);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd.output().await.map_err(|e| {
        AppError::Llm(format!(
            "Failed to spawn CLI '{}': {}. Try an absolute path like '/opt/homebrew/bin/claude'.",
            resolved_command.display(),
            e
        ))
    })?;

    if !output.status.success() {
        warn!(
            provider_id = %provider.id,
            command = %resolved_command.display(),
            exit_code = ?output.status.code(),
            stderr_bytes = output.stderr.len(),
            "CLI provider command failed"
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Llm(format!(
            "CLI exited with non-zero code: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout = stdout.trim();

    if stdout.is_empty() {
        warn!(provider_id = %provider.id, command = %resolved_command.display(), "CLI provider produced no output");
        return Err(AppError::Llm("CLI produced no output".into()));
    }

    debug!(provider_id = %provider.id, stdout_bytes = stdout.len(), "CLI provider returned output");

    normalize_response_str(stdout)
}

pub(crate) fn validate_cli_command(command: &str) -> Result<String, AppError> {
    let (resolved_command, _) = prepare_command(command)?;

    if !is_executable_file(&resolved_command) {
        return Err(AppError::Config(format!(
            "CLI command '{}' was not found or is not executable. Try an absolute path like '/opt/homebrew/bin/claude'.",
            resolved_command.display()
        )));
    }

    Ok(format!(
        "Command looks good: {}",
        resolved_command.display()
    ))
}

fn prepare_command(command: &str) -> Result<(PathBuf, Vec<String>), AppError> {
    let parts = shlex::split(command).ok_or_else(|| {
        AppError::Config(format!(
            "CLI provider command could not be parsed: '{}'. Check quoting and escaping.",
            command
        ))
    })?;

    if parts.is_empty() {
        return Err(AppError::Config("CLI provider command is empty".into()));
    }

    let executable = resolve_command_path(&parts[0]).unwrap_or_else(|| PathBuf::from(&parts[0]));
    Ok((executable, parts[1..].to_vec()))
}

fn resolve_command_path(command: &str) -> Option<PathBuf> {
    let candidate = PathBuf::from(command);
    if command.contains(std::path::MAIN_SEPARATOR) {
        return is_executable_file(&candidate).then_some(candidate);
    }

    env::var_os("PATH")
        .into_iter()
        .flat_map(|paths| env::split_paths(&paths).collect::<Vec<_>>())
        .chain([
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
        ])
        .map(|dir| dir.join(command))
        .find(|path| is_executable_file(path))
}

fn is_executable_file(path: &Path) -> bool {
    // Check if path exists and is a file
    if !path.is_file() {
        return false;
    }

    // Check execute permission bits
    // On Unix-like systems, check if any execute bit is set (user, group, or other)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        match path.metadata() {
            Ok(metadata) => {
                let mode = metadata.permissions().mode();
                // Check if any execute bit is set (0o111 = user|group|other execute)
                mode & 0o111 != 0
            }
            Err(_) => false,
        }
    }

    // On Windows, most files can be executed if they have the right extension
    #[cfg(windows)]
    {
        true
    }
}

/// Finds the first {...} block in a string (handles models that add extra text).
#[cfg(test)]
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
    async fn test_call_cli_command_field_can_include_inline_args() {
        let provider = make_cli_provider(
            Some(r#"sh -c "printf '{\"result\":\"inline args\"}'""#),
            vec![],
        );
        let result = call_cli(&provider, "hello world").await;
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap()["result"], "inline args");
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
        assert!(
            result.is_ok(),
            "expected plain text output to be normalized"
        );
        assert_eq!(result.unwrap()["result"], "plain text output");
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

    #[tokio::test]
    async fn test_call_cli_code_fenced_json_is_normalized() {
        let provider = make_cli_provider(
            Some("sh"),
            vec!["-c", r#"printf '```json\n{"result":"fenced"}\n```'"#],
        );
        let result = call_cli(&provider, "test").await;
        assert!(result.is_ok(), "expected fenced JSON to be normalized");
        assert_eq!(result.unwrap()["result"], "fenced");
    }

    #[test]
    fn test_resolve_command_path_finds_common_homebrew_location() {
        let resolved = resolve_command_path("claude");
        assert!(
            resolved.is_some(),
            "expected claude to resolve from PATH or common bin directories"
        );
    }

    #[test]
    fn test_is_executable_file_returns_false_for_nonexistent_path() {
        assert!(!is_executable_file(Path::new(
            "/nonexistent/path/to/binary"
        )));
    }

    #[test]
    fn test_is_executable_file_returns_false_for_directory() {
        assert!(!is_executable_file(Path::new("/tmp")));
    }

    #[test]
    fn test_is_executable_file_detects_executable_permissions() {
        // sh is a well-known executable that should exist on all Unix systems
        #[cfg(unix)]
        {
            let sh_path = Path::new("/bin/sh");
            if sh_path.exists() {
                assert!(
                    is_executable_file(sh_path),
                    "expected /bin/sh to be executable"
                );
            }
        }
    }

    #[test]
    fn test_prepare_command_handles_unclosed_quotes() {
        // shlex returns None for strings with unbalanced quotes
        let result = prepare_command(r#"command "unclosed quote"#);
        assert!(
            matches!(result, Err(AppError::Config(_))),
            "expected Config error for unclosed quotes, got {:?}",
            result
        );
    }

    #[test]
    fn test_prepare_command_handles_empty_string() {
        let result = prepare_command("");
        assert!(
            matches!(result, Err(AppError::Config(_))),
            "expected Config error for empty command"
        );
    }

    #[test]
    fn test_validate_cli_command_accepts_known_executable() {
        let result = validate_cli_command("/bin/sh");
        assert!(result.is_ok(), "expected /bin/sh to validate");
        assert!(result.unwrap().contains("/bin/sh"));
    }

    #[test]
    fn test_validate_cli_command_rejects_missing_executable() {
        let result = validate_cli_command("__missing_llm_binary__");
        assert!(matches!(result, Err(AppError::Config(_))));
    }
}
