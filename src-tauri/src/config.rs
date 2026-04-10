use crate::error::AppError;
use crate::models::AppConfig;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct ConfigState(pub Mutex<AppConfig>);

impl ConfigState {
    /// Acquires the lock, converting a poisoned mutex into an AppError.
    pub fn lock(&self) -> Result<std::sync::MutexGuard<AppConfig>, AppError> {
        self.0
            .lock()
            .map_err(|_| AppError::Service("Config lock poisoned due to previous panic".into()))
    }
}

/// Returns the path to the config file:
/// ~/Library/Application Support/llm-actions/config.json
pub fn config_path() -> Result<PathBuf, AppError> {
    let base = dirs::data_local_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .ok_or_else(|| AppError::Config("Cannot locate app support directory".into()))?;
    Ok(base.join("llm-actions").join("config.json"))
}

/// Load config from an explicit path (used by tests).
pub fn load_config_from(path: &Path) -> Result<AppConfig, AppError> {
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let data = std::fs::read_to_string(path)?;
    let config: AppConfig = serde_json::from_str(&data)?;
    Ok(config)
}

/// Save config to an explicit path (used by tests).
pub fn save_config_to(config: &AppConfig, path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(config)?;
    std::fs::write(path, data)?;
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
            s.ends_with("llm-actions/config.json") || s.ends_with("llm-actions\\config.json"),
            "unexpected config path: {}",
            s
        );
    }
}
