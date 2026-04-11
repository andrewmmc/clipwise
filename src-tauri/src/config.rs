use crate::error::AppError;
use crate::models::AppConfig;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tracing::info;

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
    let base = dirs::data_local_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .ok_or_else(|| AppError::Config("Cannot locate app support directory".into()))?;
    Ok(base.join("clipwise").join("config.json"))
}

/// Load config from an explicit path (used by tests).
pub fn load_config_from(path: &Path) -> Result<AppConfig, AppError> {
    if !path.exists() {
        info!(path = %path.display(), "Config file missing; using defaults");
        return Ok(AppConfig::default());
    }

    let data = std::fs::read_to_string(path)?;
    let config: AppConfig = serde_json::from_str(&data)?;
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
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(config)?;
    std::fs::write(path, data)?;
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
                headers: serde_json::Map::new(),
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
        std::fs::write(&path, r#"{"providers": [], "actions": [], "unknownField": 123}"#).unwrap();
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
    fn test_config_with_action_referencing_missing_provider_loads() {
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

        // Config should still load (validation happens at runtime)
        let result = load_config_from(&path);
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.actions[0].provider_id, "p1");
        assert!(config.providers.is_empty());
    }

    #[test]
    fn test_config_with_duplicate_provider_ids_allows() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // Two providers with same id (should be prevented by UI, but config could be edited manually)
        std::fs::write(
            &path,
            r#"{
                "providers": [
                    {"id": "p1", "name": "One", "type": "anthropic"},
                    {"id": "p1", "name": "Two", "type": "openai"}
                ],
                "actions": []
            }"#,
        )
        .unwrap();

        // Config should load (deduplication is not enforced at load time)
        let result = load_config_from(&path);
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.providers.len(), 2);
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
    fn test_config_with_zero_max_tokens_loads() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(
            &path,
            r#"{"providers": [], "actions": [], "settings": {"maxTokens": 0}}"#,
        )
        .unwrap();

        // Zero is a valid u32 value
        let result = load_config_from(&path);
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.settings.max_tokens, 0);
    }
}
