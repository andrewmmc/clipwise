use crate::config::ConfigState;
use crate::error::AppError;
use crate::models::{LlmResult, ProviderType};
use crate::providers::{anthropic, cli, openai};
use tauri::State;
use tracing::{error, info};

pub(crate) async fn run_action_inner(
    action_id: String,
    selected_text: String,
    state: &ConfigState,
) -> Result<String, AppError> {
    let selected_text_chars = selected_text.chars().count();
    let (action, provider, max_tokens) = {
        let config = state.lock()?;
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
    let provider_type = provider.provider_type.clone();

    info!(
        action_id = %action.id,
        action_name = %action.name,
        provider_id = %provider.id,
        provider_type = ?provider_type,
        model = model.unwrap_or("<provider-default>"),
        selected_text_chars,
        max_tokens,
        "Running action"
    );

    let provider_result = match provider_type {
        ProviderType::OpenAI => {
            openai::call_openai(&provider, &user_message, model, max_tokens).await?
        }
        ProviderType::Anthropic => {
            anthropic::call_anthropic(&provider, &user_message, model, max_tokens).await?
        }
        ProviderType::Cli => cli::call_cli(&provider, &user_message).await?,
    };

    let raw_result: serde_json::Value = provider_result;

    // Validate the result has a `result` string field
    let result: LlmResult = serde_json::from_value(raw_result).map_err(|_| {
        error!(action_id = %action.id, "Provider returned an invalid response payload");
        AppError::InvalidResponse
    })?;

    info!(
        action_id = %action.id,
        result_chars = result.result.chars().count(),
        "Action completed"
    );

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
