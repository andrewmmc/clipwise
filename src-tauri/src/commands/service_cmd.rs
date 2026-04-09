use crate::commands::llm_cmd::run_action;
use crate::config::ConfigState;
use crate::error::AppError;
use crate::service::ServiceState;
use tauri::State;

/// Returns and clears the text that was selected when the Services item fired.
#[tauri::command]
pub fn get_pending_text(service_state: State<'_, ServiceState>) -> Option<String> {
    service_state.take_pending_text()
}

/// Runs `action_id` on `text`, then pastes the result back into the
/// originating app using a CGEvent Cmd+V simulation.
#[tauri::command]
pub async fn run_and_paste(
    action_id: String,
    text: String,
    config_state: State<'_, ConfigState>,
    service_state: State<'_, ServiceState>,
) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    if !crate::service::is_accessibility_trusted() {
        return Err(AppError::AccessibilityPermissionDenied);
    }

    let result = run_action(action_id, text, config_state).await?;

    #[cfg(target_os = "macos")]
    {
        let pid = service_state.get_source_pid().unwrap_or(0);
        crate::service::paste_result(result, pid).await?;
    }

    Ok(())
}
