use crate::error::AppError;
use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::ManagerExt;

fn service_error(action: &str, error: impl std::fmt::Display) -> AppError {
    AppError::Service(format!("Failed to {action} start at login: {error}"))
}

pub(crate) fn is_enabled<R: Runtime>(app: &AppHandle<R>) -> Result<bool, AppError> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| service_error("check", error))
}

/// Updates the operating system login item only when its state differs from
/// the saved preference. Keeping this idempotent lets startup safely reconcile
/// a missing or externally changed login item.
pub(crate) fn set_enabled<R: Runtime>(
    app: &AppHandle<R>,
    should_enable: bool,
) -> Result<(), AppError> {
    let manager = app.autolaunch();
    let is_enabled = manager
        .is_enabled()
        .map_err(|error| service_error("check", error))?;

    if is_enabled == should_enable {
        return Ok(());
    }

    if should_enable {
        manager
            .enable()
            .map_err(|error| service_error("enable", error))
    } else {
        manager
            .disable()
            .map_err(|error| service_error("disable", error))
    }
}
