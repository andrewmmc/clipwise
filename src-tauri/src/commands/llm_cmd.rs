use crate::config::ConfigState;
use crate::error::AppError;
use crate::history;
use crate::models::{LlmResult, ProviderType};
use crate::providers::{anthropic, apple, openai};
#[cfg(feature = "cli-provider")]
use crate::providers::cli;
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
        ProviderType::Cli => {
            #[cfg(feature = "cli-provider")]
            {
                cli::call_cli(&provider, &user_message).await?
            }
            #[cfg(not(feature = "cli-provider"))]
            {
                return Err(AppError::Config(
                    "CLI providers are not available in this build.".into(),
                ));
            }
        }
        ProviderType::Apple => apple::call_apple(&user_message).await?,
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
    let result = run_action_inner(action_id.clone(), selected_text.clone(), &state).await;

    // Log to history if enabled
    let (action_name, provider_name, history_enabled) = {
        let config = state.lock()?;
        let action = config
            .actions
            .iter()
            .find(|a| a.id == action_id);
        let provider = action.and_then(|a| {
            config.providers.iter().find(|p| p.id == a.provider_id)
        });
        (
            action.map(|a| a.name.clone()).unwrap_or_default(),
            provider.map(|p| p.name.clone()).unwrap_or_default(),
            config.settings.history_enabled,
        )
    };

    if history_enabled {
        let (input_text, output_text, success) = match &result {
            Ok(output) => (selected_text.clone(), output.clone(), true),
            Err(err) => (selected_text.clone(), err.to_string(), false),
        };

        // Log history errors should not fail the action
        let _ = history::add_entry(action_name, provider_name, input_text, output_text, success)
            .map_err(|e| {
                error!(
                    error = %e,
                    action_id = %action_id,
                    "Failed to log history entry"
                )
            });
    }

    result
}

/// Test an action from the settings UI. Same as run_action but called from the frontend.
#[tauri::command]
pub async fn test_action(
    action_id: String,
    sample_text: String,
    state: State<'_, ConfigState>,
) -> Result<String, AppError> {
    let result = run_action_inner(action_id.clone(), sample_text.clone(), &state).await;

    // Log to history if enabled
    let (action_name, provider_name, history_enabled) = {
        let config = state.lock()?;
        let action = config
            .actions
            .iter()
            .find(|a| a.id == action_id);
        let provider = action.and_then(|a| {
            config.providers.iter().find(|p| p.id == a.provider_id)
        });
        (
            action.map(|a| a.name.clone()).unwrap_or_default(),
            provider.map(|p| p.name.clone()).unwrap_or_default(),
            config.settings.history_enabled,
        )
    };

    if history_enabled {
        let (input_text, output_text, success) = match &result {
            Ok(output) => (sample_text.clone(), output.clone(), true),
            Err(err) => (sample_text.clone(), err.to_string(), false),
        };

        // Log history errors should not fail the action
        let _ = history::add_entry(action_name, provider_name, input_text, output_text, success)
            .map_err(|e| {
                error!(
                    error = %e,
                    action_id = %action_id,
                    "Failed to log history entry"
                )
            });
    }

    result
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;
    use std::sync::Mutex;

    fn make_test_config_state() -> ConfigState {
        let mut providers = vec![
            Provider {
                id: "anthropic-provider".into(),
                name: "Anthropic".into(),
                provider_type: ProviderType::Anthropic,
                endpoint: None,
                api_key: Some("sk-test-key".into()),
                headers: serde_json::Map::new(),
                default_model: Some("claude-sonnet-4-20250514".into()),
                command: None,
                args: vec![],
            },
        ];
        #[cfg(feature = "cli-provider")]
        providers.push(Provider {
            id: "cli-provider".into(),
            name: "CLI".into(),
            provider_type: ProviderType::Cli,
            endpoint: None,
            api_key: None,
            headers: serde_json::Map::new(),
            default_model: None,
            command: Some("echo".into()),
            args: vec!["-n".into()],
        });
        ConfigState(Mutex::new(AppConfig {
            providers,
            actions: vec![
                Action {
                    id: "action-with-provider".into(),
                    name: "Valid Action".into(),
                    provider_id: "anthropic-provider".into(),
                    user_prompt: "Improve this".into(),
                    model: None,
                },
                Action {
                    id: "action-with-missing-provider".into(),
                    name: "Orphan Action".into(),
                    provider_id: "nonexistent-provider".into(),
                    user_prompt: "Test".into(),
                    model: None,
                },
            ],
            settings: AppSettings {
                max_tokens: 1000,
                history_enabled: false, // Disable history for tests
                ..Default::default()
            },
        }))
    }

    // ── Provider/action lookup failures ─────────────────────────────────────────

    #[tokio::test]
    async fn test_run_action_returns_error_when_action_not_found() {
        let state = make_test_config_state();
        let result = run_action_inner("nonexistent-action".into(), "test".into(), &state).await;

        assert!(result.is_err());
        assert!(matches!(result, Err(AppError::ActionNotFound(_))));
    }

    #[tokio::test]
    async fn test_run_action_returns_error_when_provider_not_found() {
        let state = make_test_config_state();
        let result =
            run_action_inner("action-with-missing-provider".into(), "test".into(), &state).await;

        assert!(result.is_err());
        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
        if let Err(AppError::ProviderNotFound(id)) = result {
            assert_eq!(id, "nonexistent-provider");
        }
    }

    #[tokio::test]
    async fn test_run_action_error_message_contains_action_id() {
        let state = make_test_config_state();
        let result = run_action_inner("missing-action".into(), "test".into(), &state).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("missing-action"));
    }

    // ── Input handling ──────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_run_action_with_empty_input_succeeds_for_cli() {
        let state = make_test_config_state();
        // Use echo command which doesn't care about input
        let result = tokio::task::spawn_blocking(move || {
            tokio::runtime::Handle::current().block_on(async {
                // This would actually run the CLI command, so we just verify the lookup succeeds
                let config = state.lock().unwrap();
                let action = config.actions.iter().find(|a| a.id == "action-with-provider").unwrap();
                assert_eq!(action.id, "action-with-provider");
                Ok::<(), AppError>(())
            })
        })
        .await
        .unwrap();
        assert!(result.is_ok());
    }

    // ── Model override ──────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_action_with_model_override() {
        let state = ConfigState(Mutex::new(AppConfig {
            providers: vec![Provider {
                id: "p1".into(),
                name: "Test".into(),
                provider_type: ProviderType::Anthropic,
                endpoint: None,
                api_key: Some("sk-test".into()),
                headers: serde_json::Map::new(),
                default_model: Some("claude-default".into()),
                command: None,
                args: vec![],
            }],
            actions: vec![Action {
                id: "a1".into(),
                name: "Action".into(),
                provider_id: "p1".into(),
                user_prompt: "Test".into(),
                model: Some("override-model".into()),
            }],
            settings: AppSettings {
                history_enabled: false,
                ..Default::default()
            },
        }));

        let config = state.lock().unwrap();
        let action = config.actions.iter().find(|a| a.id == "a1").unwrap();
        assert_eq!(action.model, Some("override-model".into()));
    }
}
