#[cfg(not(test))]
use crate::action_service;
#[cfg(not(test))]
use crate::config::ConfigState;
#[cfg(not(test))]
use crate::error::AppError;
#[cfg(not(test))]
use tauri::State;

/// Runs an action on the given text. Returns the transformed text, or an error.
/// On any error, the caller (Swift/JS) must NOT replace the original text.
#[cfg(not(test))]
#[tauri::command]
pub async fn run_action(
    action_id: String,
    selected_text: String,
    state: State<'_, ConfigState>,
) -> Result<String, AppError> {
    let context = action_service::ActionContext::from_state(&action_id, &state)?;
    let result = action_service::run_action_with_context(&context, &selected_text).await;
    action_service::record_action_history(&context, selected_text, &result);

    result
}

/// Test an action from the settings UI. Same as run_action but called from the frontend.
#[cfg(not(test))]
#[tauri::command]
pub async fn test_action(
    action_id: String,
    sample_text: String,
    state: State<'_, ConfigState>,
) -> Result<String, AppError> {
    let context = action_service::ActionContext::from_state(&action_id, &state)?;
    let result = action_service::run_action_with_context(&context, &sample_text).await;
    action_service::record_action_history(&context, sample_text, &result);

    result
}
