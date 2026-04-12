use serde::Serialize;

#[cfg(feature = "ts")]
use ts_rs::TS;

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct AppInfo {
    pub version: String,
    pub commit_hash: Option<String>,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    let version = option_env!("LLM_ACTIONS_VERSION")
        .map(String::from)
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());

    let commit_hash = option_env!("LLM_ACTIONS_COMMIT_HASH").map(String::from);

    AppInfo {
        version,
        commit_hash,
    }
}

#[tauri::command]
pub fn is_cli_provider_enabled() -> bool {
    cfg!(feature = "cli-provider")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_app_info_returns_version() {
        let info = get_app_info();
        assert!(!info.version.is_empty());
    }
}
