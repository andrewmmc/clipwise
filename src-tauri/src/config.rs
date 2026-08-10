use crate::error::AppError;
use crate::json_store::{load_json_or_default, save_pretty_json};
use crate::models::{AppConfig, AppSettings, ProviderType};
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

pub(crate) fn validate_settings(settings: &AppSettings) -> Result<(), AppError> {
    if !(MIN_MAX_TOKENS..=MAX_MAX_TOKENS).contains(&settings.max_tokens) {
        return Err(AppError::Config(format!(
            "max_tokens must be between {MIN_MAX_TOKENS} and {MAX_MAX_TOKENS} (got {})",
            settings.max_tokens
        )));
    }
    Ok(())
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
        if provider.name.trim().is_empty() {
            return Err(AppError::Config(format!(
                "Provider {} has an empty name",
                provider.id
            )));
        }
        validate_provider_endpoint(provider)?;
        for (name, value) in &provider.headers {
            HeaderName::from_bytes(name.as_bytes()).map_err(|_| {
                AppError::Config(format!(
                    "Provider {} has invalid header name {name:?}",
                    provider.id
                ))
            })?;
            HeaderValue::from_str(value).map_err(|_| {
                AppError::Config(format!(
                    "Provider {} has an invalid value for header {name:?}",
                    provider.id
                ))
            })?;
        }

        match provider.provider_type {
            ProviderType::OpenAI | ProviderType::Anthropic => {
                if provider.api_key.as_deref().unwrap_or("").trim().is_empty() {
                    return Err(AppError::Config(format!(
                        "API provider {} is missing an API key",
                        provider.id
                    )));
                }
            }
            ProviderType::Cli => {
                if provider.command.as_deref().unwrap_or("").trim().is_empty() {
                    return Err(AppError::Config(format!(
                        "CLI provider {} is missing a command",
                        provider.id
                    )));
                }
            }
            ProviderType::Apple => apple_provider_count += 1,
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
        if action.name.trim().is_empty() {
            return Err(AppError::Config(format!(
                "Action {} has an empty name",
                action.id
            )));
        }
        if action.user_prompt.trim().is_empty() {
            return Err(AppError::Config(format!(
                "Action {} has an empty prompt",
                action.id
            )));
        }
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
