use crate::error::AppError;
use crate::json_store::{load_json_or_default, save_pretty_json};
use crate::models::{Action, AppConfig, AppSettings, Provider, ProviderType};
use crate::paths::app_data_dir;
use crate::providers::http::validate_provider_endpoint;
use reqwest::header::{HeaderName, HeaderValue};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tracing::info;

/// Inclusive bounds for provider response limits accepted from settings.
pub(crate) const MIN_MAX_TOKENS: u32 = 1;
pub(crate) const MAX_MAX_TOKENS: u32 = 32_768;
pub(crate) const MAX_NAME_CHARS: usize = 100;
pub(crate) const MAX_USER_PROMPT_CHARS: usize = 2_000;
pub(crate) const MAX_MODEL_CHARS: usize = 256;
pub(crate) const MAX_ENDPOINT_CHARS: usize = 2_048;
pub(crate) const MAX_API_KEY_CHARS: usize = 16_384;
pub(crate) const MAX_HEADER_COUNT: usize = 50;
pub(crate) const MAX_HEADER_NAME_CHARS: usize = 256;
pub(crate) const MAX_HEADER_VALUE_CHARS: usize = 8_192;
pub(crate) const MAX_CLI_COMMAND_CHARS: usize = 4_096;
pub(crate) const MAX_CLI_ARGS: usize = 100;
pub(crate) const MAX_CLI_ARG_CHARS: usize = 4_096;
pub(crate) const MAX_SELECTED_TEXT_CHARS: usize = 1_000_000;

fn validate_char_limit(label: &str, value: &str, max_chars: usize) -> Result<(), AppError> {
    let actual = value.chars().count();
    if actual > max_chars {
        return Err(AppError::Config(format!(
            "{label} must be {max_chars} characters or fewer (got {actual})"
        )));
    }
    Ok(())
}

pub(crate) fn validate_settings(settings: &AppSettings) -> Result<(), AppError> {
    if !(MIN_MAX_TOKENS..=MAX_MAX_TOKENS).contains(&settings.max_tokens) {
        return Err(AppError::Config(format!(
            "max_tokens must be between {MIN_MAX_TOKENS} and {MAX_MAX_TOKENS} (got {})",
            settings.max_tokens
        )));
    }
    Ok(())
}

pub(crate) fn validate_provider_fields(provider: &Provider) -> Result<(), AppError> {
    if provider.name.trim().is_empty() {
        return Err(AppError::Config("Provider name cannot be empty".into()));
    }
    validate_char_limit("Provider name", &provider.name, MAX_NAME_CHARS)?;

    if let Some(endpoint) = provider.endpoint.as_deref() {
        validate_char_limit("Provider endpoint", endpoint, MAX_ENDPOINT_CHARS)?;
    }
    if let Some(api_key) = provider.api_key.as_deref() {
        validate_char_limit("Provider API key", api_key, MAX_API_KEY_CHARS)?;
    }
    if let Some(model) = provider.default_model.as_deref() {
        validate_char_limit("Provider default model", model, MAX_MODEL_CHARS)?;
    }
    if provider.headers.len() > MAX_HEADER_COUNT {
        return Err(AppError::Config(format!(
            "Provider headers must contain {MAX_HEADER_COUNT} entries or fewer"
        )));
    }
    for (name, value) in &provider.headers {
        validate_char_limit("Provider header name", name, MAX_HEADER_NAME_CHARS)?;
        validate_char_limit("Provider header value", value, MAX_HEADER_VALUE_CHARS)?;
        HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| AppError::Config(format!("Invalid provider header name {name:?}")))?;
        HeaderValue::from_str(value).map_err(|_| {
            AppError::Config(format!("Invalid value for provider header {name:?}"))
        })?;
    }
    validate_provider_endpoint(provider)?;

    match provider.provider_type {
        ProviderType::OpenAI | ProviderType::Anthropic => {
            if provider.api_key.as_deref().unwrap_or("").trim().is_empty() {
                return Err(AppError::Config(
                    "API providers require an API key".into(),
                ));
            }
        }
        ProviderType::Cli => {
            let command = provider.command.as_deref().unwrap_or("");
            if command.trim().is_empty() {
                return Err(AppError::Config(
                    "CLI providers require a command".into(),
                ));
            }
            validate_char_limit("CLI command", command, MAX_CLI_COMMAND_CHARS)?;
            if provider.args.len() > MAX_CLI_ARGS {
                return Err(AppError::Config(format!(
                    "CLI providers may have at most {MAX_CLI_ARGS} arguments"
                )));
            }
            for arg in &provider.args {
                validate_char_limit("CLI argument", arg, MAX_CLI_ARG_CHARS)?;
            }
        }
        ProviderType::Apple => {}
    }

    Ok(())
}

pub(crate) fn validate_action_fields(action: &Action) -> Result<(), AppError> {
    if action.name.trim().is_empty() {
        return Err(AppError::Config("Action name cannot be empty".into()));
    }
    validate_char_limit("Action name", &action.name, MAX_NAME_CHARS)?;
    if action.user_prompt.trim().is_empty() {
        return Err(AppError::Config("Action prompt cannot be empty".into()));
    }
    validate_char_limit(
        "Action prompt",
        &action.user_prompt,
        MAX_USER_PROMPT_CHARS,
    )?;
    if let Some(model) = action.model.as_deref() {
        validate_char_limit("Action model", model, MAX_MODEL_CHARS)?;
    }
    Ok(())
}

pub(crate) fn validate_selected_text(selected_text: &str) -> Result<(), AppError> {
    validate_char_limit(
        "Selected text",
        selected_text,
        MAX_SELECTED_TEXT_CHARS,
    )
}

pub(crate) fn validate_config(config: &AppConfig) -> Result<(), AppError> {
    validate_settings(&config.settings)?;

    let mut provider_ids = HashSet::new();
    let mut apple_provider_count = 0;
    for provider in &config.providers {
        if provider.id.trim().is_empty() {
            return Err(AppError::Config("Provider ID cannot be empty".into()));
        }
        if !provider_ids.insert(provider.id.as_str()) {
            return Err(AppError::Config(format!(
                "Duplicate provider ID: {}",
                provider.id
            )));
        }
        validate_provider_fields(provider)?;
        if provider.provider_type == ProviderType::Apple {
            apple_provider_count += 1;
        }
    }

    if apple_provider_count > 1 {
        return Err(AppError::Config(
            "Only one Apple Intelligence provider can be configured".into(),
        ));
    }

    let mut action_ids = HashSet::new();
    for action in &config.actions {
        if action.id.trim().is_empty() {
            return Err(AppError::Config("Action ID cannot be empty".into()));
        }
        if !action_ids.insert(action.id.as_str()) {
            return Err(AppError::Config(format!(
                "Duplicate action ID: {}",
                action.id
            )));
        }
        validate_action_fields(action)?;
        if !provider_ids.contains(action.provider_id.as_str()) {
            return Err(AppError::Config(format!(
                "Action {} references missing provider {}",
                action.id, action.provider_id
            )));
        }
    }

    Ok(())
}

pub struct ConfigState(pub Mutex<AppConfig>);

impl ConfigState {
    /// Acquires the lock, converting a poisoned mutex into an AppError.
    pub fn lock(&self) -> Result<std::sync::MutexGuard<'_, AppConfig>, AppError> {
        self.0
            .lock()
            .map_err(|_| AppError::Service("Config lock poisoned due to previous panic".into()))
    }
}

/// Returns the path to the config file:
/// ~/Library/Application Support/clipwise/config.json
pub fn config_path() -> Result<PathBuf, AppError> {
    Ok(app_data_dir()?.join("config.json"))
}

/// Load config from an explicit path (used by tests).
pub fn load_config_from(path: &Path) -> Result<AppConfig, AppError> {
    if !path.exists() {
        info!(path = %path.display(), "Config file missing; using defaults");
    }
    let config: AppConfig = load_json_or_default(path)?;
    validate_config(&config)?;
    info!(
        path = %path.display(),
        provider_count = config.providers.len(),
        action_count = config.actions.len(),
        "Loaded config"
    );
    Ok(config)
}

/// Save config to an explicit path (used by tests).
pub fn save_config_to(config: &AppConfig, path: &Path) -> Result<(), AppError> {
    validate_config(config)?;
    save_pretty_json(config, path)?;
    info!(
        path = %path.display(),
        provider_count = config.providers.len(),
        action_count = config.actions.len(),
        "Saved config"
    );
    Ok(())
}

pub fn load_config() -> Result<AppConfig, AppError> {
    load_config_from(&config_path()?)
}

pub fn save_config(config: &AppConfig) -> Result<(), AppError> {
    save_config_to(config, &config_path()?)
}

fn quarantine_invalid_config_at(path: &Path) -> Result<PathBuf, AppError> {
    if !path.exists() {
        return Err(AppError::Config(
            "Cannot preserve invalid config because the file does not exist".into(),
        ));
    }

    let backup_path = path.with_file_name(format!("config.corrupt.{}.json", uuid::Uuid::new_v4()));
    std::fs::rename(path, &backup_path)?;
    Ok(backup_path)
}

pub fn quarantine_invalid_config() -> Result<PathBuf, AppError> {
    quarantine_invalid_config_at(&config_path()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;
    use tempfile::TempDir;

    fn make_test_config() -> AppConfig {
        AppConfig {
            providers: vec![Provider {
                id: "p1".into(),
                name: "Test Provider".into(),
                provider_type: ProviderType::Anthropic,
                endpoint: None,
                api_key: Some("sk-test".into()),
                headers: ProviderHeaders::new(),
                default_model: Some("claude-sonnet-4-20250514".into()),
                command: None,
                args: vec![],
            }],
            actions: vec![Action {
                id: "a1".into(),
                name: "Test Action".into(),
                provider_id: "p1".into(),
                user_prompt: "Improve this text".into(),
                model: None,
            }],
            settings: AppSettings::default(),
        }
    }

    #[test]
    fn test_load_config_returns_default_when_file_missing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let config = load_config_from(&path).unwrap();
        assert!(config.providers.is_empty());
        assert!(config.actions.is_empty());
    }

    #[test]
    fn test_save_and_load_round_trip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let original = make_test_config();
        save_config_to(&original, &path).unwrap();
        let loaded = load_config_from(&path).unwrap();
        assert_eq!(loaded.providers.len(), 1);
        assert_eq!(loaded.providers[0].id, "p1");
        assert_eq!(loaded.providers[0].api_key, Some("sk-test".into()));
        assert_eq!(loaded.actions.len(), 1);
        assert_eq!(loaded.actions[0].name, "Test Action");
        assert_eq!(loaded.settings.max_tokens, 4096);
    }

    #[test]
    fn test_save_creates_parent_directories() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("nested").join("deep").join("config.json");
        save_config_to(&AppConfig::default(), &path).unwrap();
        assert!(path.exists());
    }

    #[test]
    fn test_load_config_invalid_json_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{ not valid json }").unwrap();
        assert!(load_config_from(&path).is_err());
    }

    #[test]
    fn test_save_config_produces_pretty_json() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        save_config_to(&AppConfig::default(), &path).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(
            content.contains('\n'),
            "expected pretty-printed JSON with newlines"
        );
    }

    #[test]
    fn test_config_path_ends_with_expected_segments() {
        let path = config_path().unwrap();
        let s = path.to_string_lossy();
        assert!(
            s.ends_with("clipwise/config.json") || s.ends_with("clipwise\\config.json"),
            "unexpected config path: {}",
            s
        );
    }

    // ── Config corruption scenarios ─────────────────────────────────────────────

    #[test]
    fn test_load_config_malformed_json_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{ malformed }").unwrap();
        let result = load_config_from(&path);
        assert!(result.is_err());
        assert!(matches!(result, Err(AppError::Json(_))));
    }

    #[test]
    fn test_load_config_truncated_json_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{\"providers\": []").unwrap(); // Missing closing brace
        let result = load_config_from(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_load_config_with_invalid_field_types() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // providers should be an array, not a string
        std::fs::write(&path, "{\"providers\": \"not-an-array\"}").unwrap();
        let result = load_config_from(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_load_config_with_unknown_fields_ignores_them() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // Unknown fields should be ignored (serde default behavior)
        std::fs::write(
            &path,
            r#"{"providers": [], "actions": [], "unknownField": 123}"#,
        )
        .unwrap();
        let result = load_config_from(&path);
        assert!(result.is_ok());
        assert!(result.unwrap().providers.is_empty());
    }

    #[test]
    fn test_load_config_empty_file_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "").unwrap();
        let result = load_config_from(&path);
        // Empty string is not valid JSON
        assert!(result.is_err());
        assert!(matches!(result, Err(AppError::Json(_))));
    }

    #[test]
    fn test_load_config_with_empty_settings_uses_defaults() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // Empty settings object should use defaults
        std::fs::write(&path, r#"{"providers": [], "actions": [], "settings": {}}"#).unwrap();
        let result = load_config_from(&path);
        assert!(result.is_ok());
        let config = result.unwrap();
        assert!(config.providers.is_empty());
        assert!(config.actions.is_empty());
        // settings should use its Default impl when empty object
        assert!(config.settings.show_notification_on_complete);
    }

    // ── Lock poisoning scenarios ────────────────────────────────────────────────

    #[test]
    fn test_config_state_lock_returns_error_when_poisoned() {
        use std::sync::Arc;
        use std::thread;

        let config = AppConfig::default();
        let state = Arc::new(ConfigState(std::sync::Mutex::new(config)));
        let state_clone = state.clone();

        // Poison the mutex by panicking in a thread while holding the lock
        let handle = thread::spawn(move || {
            let _lock = state_clone.0.lock().unwrap();
            panic!("intentional panic to poison mutex");
        });

        assert!(handle.join().is_err());

        // Attempting to lock should return an error via our custom lock() method
        let lock_result = state.lock();
        assert!(lock_result.is_err());
        assert!(matches!(lock_result, Err(AppError::Service(_))));
    }

    // ── Provider/action relationship validation ─────────────────────────────────

    #[test]
    fn test_config_with_action_referencing_missing_provider_is_rejected() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // Action references provider "p1" which doesn't exist
        std::fs::write(
            &path,
            r#"{
                "providers": [],
                "actions": [{"id": "a1", "name": "Test", "providerId": "p1", "userPrompt": "test"}]
            }"#,
        )
        .unwrap();

        let result = load_config_from(&path);
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[test]
    fn test_config_with_duplicate_provider_ids_is_rejected() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(
            &path,
            r#"{
                "providers": [
                    {"id": "p1", "name": "One", "type": "anthropic", "apiKey": "key"},
                    {"id": "p1", "name": "Two", "type": "openai", "apiKey": "key"}
                ],
                "actions": []
            }"#,
        )
        .unwrap();

        let result = load_config_from(&path);
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    // ── Settings validation ─────────────────────────────────────────────────────

    #[test]
    fn test_config_with_invalid_max_tokens_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // Negative max_tokens is invalid for u32
        std::fs::write(
            &path,
            r#"{"providers": [], "actions": [], "settings": {"maxTokens": -100}}"#,
        )
        .unwrap();

        // Should fail to parse - negative numbers are invalid for u32
        let result = load_config_from(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_config_with_zero_max_tokens_is_rejected() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(
            &path,
            r#"{"providers": [], "actions": [], "settings": {"maxTokens": 0}}"#,
        )
        .unwrap();

        let result = load_config_from(&path);
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[test]
    fn test_provider_field_limits_are_enforced() {
        let mut provider = make_test_config().providers.remove(0);
        provider.name = "n".repeat(MAX_NAME_CHARS + 1);
        assert!(matches!(
            validate_provider_fields(&provider),
            Err(AppError::Config(_))
        ));

        provider.name = "Provider".into();
        provider.headers = (0..=MAX_HEADER_COUNT)
            .map(|index| (format!("x-header-{index}"), "value".into()))
            .collect();
        assert!(matches!(
            validate_provider_fields(&provider),
            Err(AppError::Config(_))
        ));
    }

    #[test]
    fn test_action_field_limits_are_enforced() {
        let mut action = make_test_config().actions.remove(0);
        action.user_prompt = "p".repeat(MAX_USER_PROMPT_CHARS + 1);

        assert!(matches!(
            validate_action_fields(&action),
            Err(AppError::Config(_))
        ));
    }

    #[test]
    fn test_selected_text_limit_is_enforced() {
        assert!(validate_selected_text(&"t".repeat(MAX_SELECTED_TEXT_CHARS)).is_ok());
        assert!(matches!(
            validate_selected_text(&"t".repeat(MAX_SELECTED_TEXT_CHARS + 1)),
            Err(AppError::Config(_))
        ));
    }

    #[test]
    fn test_quarantine_invalid_config_preserves_original_contents() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{ malformed }").unwrap();

        let backup_path = quarantine_invalid_config_at(&path).unwrap();

        assert!(!path.exists());
        assert_eq!(
            std::fs::read_to_string(backup_path).unwrap(),
            "{ malformed }"
        );
    }
}
