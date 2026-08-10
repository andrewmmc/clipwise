#[cfg(not(test))]
use crate::action_service;
#[cfg(not(test))]
use crate::config::{
    validate_action_fields, validate_provider_fields, validate_selected_text, ConfigState,
};
#[cfg(not(test))]
use crate::error::AppError;
#[cfg(not(test))]
use crate::models::{Action, Provider, ProviderType};
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
    validate_selected_text(&selected_text)?;
    let context = action_service::ActionContext::from_state(&action_id, &state)?;
    let result = action_service::run_action_with_context(&context, &selected_text).await;
    action_service::record_action_history(&context, selected_text, &result).await;

    result
}

/// Test an action from the settings UI without adding the sample transformation to history.
#[cfg(not(test))]
#[tauri::command]
pub async fn test_action(
    action: Action,
    sample_text: String,
    state: State<'_, ConfigState>,
) -> Result<String, AppError> {
    validate_action_fields(&action)?;
    validate_selected_text(&sample_text)?;
    let context = action_service::ActionContext::from_action(action, &state)?;
    action_service::run_action_with_context(&context, &sample_text).await
}

/// Test an API provider's connection using the current form settings.
#[cfg(not(test))]
#[tauri::command]
pub async fn test_provider(
    mut provider: Provider,
    state: State<'_, ConfigState>,
) -> Result<String, AppError> {
    if matches!(
        provider.provider_type,
        ProviderType::OpenAI | ProviderType::Anthropic
    ) && provider.api_key.as_deref().unwrap_or("").trim().is_empty()
        && !provider.id.is_empty()
    {
        provider.api_key = state
            .lock()?
            .providers
            .iter()
            .find(|stored| stored.id == provider.id)
            .and_then(|stored| stored.api_key.clone());
    }
    validate_provider_fields(&provider)?;
    match provider.provider_type {
        ProviderType::OpenAI | ProviderType::Anthropic => {}
        _ => {
            return Err(AppError::Config("Only API providers can be tested.".into()));
        }
    }

    action_service::test_provider_connection(&provider).await
}
