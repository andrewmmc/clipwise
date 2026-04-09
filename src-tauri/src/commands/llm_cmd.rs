use crate::config::ConfigState;
use crate::error::AppError;
use crate::models::{LlmResult, ProviderType};
use crate::providers::{anthropic, cli, openai};
use tauri::State;

pub(crate) async fn run_action_inner(
    action_id: String,
    selected_text: String,
    state: &ConfigState,
) -> Result<String, AppError> {
    let (action, provider, max_tokens) = {
        let config = state.0.lock().unwrap();
        let action = config
            .actions
            .iter()
            .find(|a| a.id == action_id)
            .cloned()
            .ok_or_else(|| AppError::ActionNotFound(action_id.clone()))?;
        let provider = config
            .providers
            .iter()
            .find(|p| p.id == action.provider_id)
            .cloned()
            .ok_or_else(|| AppError::ProviderNotFound(action.provider_id.clone()))?;
        let max_tokens = config.settings.max_tokens;
        (action, provider, max_tokens)
    };

    let user_message = format!("{}\n\n{}", action.user_prompt, selected_text);
    let model = action.model.as_deref();

    let raw_result: serde_json::Value = match provider.provider_type {
        ProviderType::OpenAI => {
            openai::call_openai(&provider, &user_message, model, max_tokens).await?
        }
        ProviderType::Anthropic => {
            anthropic::call_anthropic(&provider, &user_message, model, max_tokens).await?
        }
        ProviderType::Cli => cli::call_cli(&provider, &user_message).await?,
    };

    // Validate the result has a `result` string field
    let result: LlmResult =
        serde_json::from_value(raw_result).map_err(|_| AppError::InvalidResponse)?;

    Ok(result.result)
}

/// Runs an action on the given text. Returns the transformed text, or an error.
/// On any error, the caller (Swift/JS) must NOT replace the original text.
#[tauri::command]
pub async fn run_action(
    action_id: String,
    selected_text: String,
    state: State<'_, ConfigState>,
) -> Result<String, AppError> {
    run_action_inner(action_id, selected_text, &state).await
}

/// Test an action from the settings UI. Same as run_action but called from the frontend.
#[tauri::command]
pub async fn test_action(
    action_id: String,
    sample_text: String,
    state: State<'_, ConfigState>,
) -> Result<String, AppError> {
    run_action_inner(action_id, sample_text, &state).await
}
