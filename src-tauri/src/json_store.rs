use crate::error::AppError;
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;

pub(crate) fn load_json_or_default<T>(path: &Path) -> Result<T, AppError>
where
    T: DeserializeOwned + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }

    let data = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

pub(crate) fn save_pretty_json<T>(value: &T, path: &Path) -> Result<(), AppError>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let data = serde_json::to_string_pretty(value)?;
    std::fs::write(path, data)?;
    Ok(())
}
