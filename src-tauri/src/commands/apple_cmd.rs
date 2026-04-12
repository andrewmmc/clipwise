use crate::providers::apple;
use serde::Serialize;

#[cfg(feature = "ts")]
use ts_rs::TS;

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct AppleModelAvailability {
    pub available: bool,
    pub reason: Option<String>,
}

#[cfg_attr(not(test), tauri::command)]
pub async fn check_apple_model_availability() -> AppleModelAvailability {
    match apple::check_availability().await {
        Ok((available, reason)) => AppleModelAvailability { available, reason },
        Err(_) => AppleModelAvailability {
            available: false,
            reason: Some("not_supported".to_string()),
        },
    }
}
