use crate::error::AppError;
use serde::{de::DeserializeOwned, Serialize};
use std::path::{Path, PathBuf};

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

/// Saves `value` as pretty-printed JSON at `path`, writing atomically.
///
/// A crash or power loss partway through a plain `fs::write` would leave a
/// truncated/corrupt file, which `load_json_or_default` treats as an
/// unreadable config or history file (typically resetting it to defaults on
/// next launch). To avoid that, we write to a uniquely-named temp file in the
/// same directory and `rename` it into place; `rename` within a single
/// filesystem is atomic, so `path` always contains either the old or the new
/// complete contents, never a partial write.
pub(crate) fn save_pretty_json<T>(value: &T, path: &Path) -> Result<(), AppError>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let data = serde_json::to_string_pretty(value)?;
    let tmp_path = tmp_path_for(path);
    std::fs::write(&tmp_path, &data).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp_path);
    })?;
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

/// Builds a unique temp-file path alongside `path`, e.g. `config.json` ->
/// `.config.json.<uuid>.tmp`. Unique per call so concurrent saves (including
/// from other processes) never collide on the same temp file.
fn tmp_path_for(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    path.with_file_name(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use tempfile::TempDir;

    #[derive(Debug, Serialize, Deserialize, Default, PartialEq)]
    struct Sample {
        value: String,
    }

    #[test]
    fn test_save_pretty_json_does_not_leave_temp_file_behind() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        save_pretty_json(&Sample { value: "a".into() }, &path).unwrap();

        let entries: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(entries, vec![std::ffi::OsString::from("config.json")]);
    }

    #[test]
    fn test_save_pretty_json_overwrites_existing_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        save_pretty_json(
            &Sample {
                value: "first".into(),
            },
            &path,
        )
        .unwrap();
        save_pretty_json(
            &Sample {
                value: "second".into(),
            },
            &path,
        )
        .unwrap();

        let loaded: Sample = load_json_or_default(&path).unwrap();
        assert_eq!(loaded.value, "second");
    }

    #[test]
    fn test_tmp_path_for_is_unique_per_call() {
        let path = Path::new("/tmp/example/config.json");
        let first = tmp_path_for(path);
        let second = tmp_path_for(path);
        assert_ne!(first, second);
        assert_eq!(first.parent(), path.parent());
    }

    #[test]
    fn test_save_pretty_json_survives_a_previously_orphaned_temp_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // Simulate a leftover temp file from a previous crashed write.
        std::fs::write(dir.path().join(".config.json.stale.tmp"), "garbage").unwrap();

        save_pretty_json(&Sample { value: "ok".into() }, &path).unwrap();

        let loaded: Sample = load_json_or_default(&path).unwrap();
        assert_eq!(loaded.value, "ok");
    }
}
