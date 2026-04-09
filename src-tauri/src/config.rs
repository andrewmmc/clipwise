use crate::error::AppError;
use crate::models::AppConfig;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct ConfigState(pub Mutex<AppConfig>);

/// Returns the path to the config file:
/// ~/Library/Application Support/llm-actions/config.json
pub fn config_path() -> Result<PathBuf, AppError> {
    let base = dirs::data_local_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .ok_or_else(|| AppError::Config("Cannot locate app support directory".into()))?;
    Ok(base.join("llm-actions").join("config.json"))
}

pub fn load_config() -> Result<AppConfig, AppError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let data = std::fs::read_to_string(&path)?;
    let config: AppConfig = serde_json::from_str(&data)?;
    Ok(config)
}

pub fn save_config(config: &AppConfig) -> Result<(), AppError> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, data)?;
    Ok(())
}
