use crate::config::{validate_selected_text, ConfigState};
use crate::error::AppError;
use crate::history;
use crate::models::{Action, AppConfig, LlmResult, Provider, ProviderType};
#[cfg(feature = "cli-provider")]
use crate::providers::cli;
use crate::providers::{anthropic, apple, openai};
use tracing::{error, info};

#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone)]
pub(crate) struct ActionContext {
    pub action: Action,
    pub provider: Provider,
    pub max_tokens: u32,
    pub history_enabled: bool,
    pub history_generation: u64,
    pub show_notification_on_complete: bool,
}

impl ActionContext {
    pub(crate) fn from_state(action_id: &str, state: &ConfigState) -> Result<Self, AppError> {
        let config = state.lock()?;
        let action = config
            .actions
            .iter()
            .find(|a| a.id == action_id)
            .cloned()
            .ok_or_else(|| AppError::ActionNotFound(action_id.to_string()))?;
        Self::from_action_and_config(action, &config)
    }

    pub(crate) fn from_action(action: Action, state: &ConfigState) -> Result<Self, AppError> {
        let config = state.lock()?;
        Self::from_action_and_config(action, &config)
    }

    fn from_action_and_config(action: Action, config: &AppConfig) -> Result<Self, AppError> {
        let provider = config
            .providers
            .iter()
            .find(|p| p.id == action.provider_id)
            .cloned()
            .ok_or_else(|| AppError::ProviderNotFound(action.provider_id.clone()))?;

        Ok(Self {
            action,
            provider,
            max_tokens: config.settings.max_tokens,
            history_enabled: config.settings.history_enabled,
            history_generation: history::current_generation(),
            show_notification_on_complete: config.settings.show_notification_on_complete,
        })
    }
}

#[cfg_attr(test, allow(dead_code))]
pub(crate) async fn run_action_with_context(
    context: &ActionContext,
    selected_text: &str,
) -> Result<String, AppError> {
    // Keep the limit at the shared execution boundary so every caller,
    // including tray actions, receives the same protection.
    validate_selected_text(selected_text)?;
    let selected_text_chars = selected_text.chars().count();
    let user_message = format!("{}\n\n{}", context.action.user_prompt, selected_text);
    let model = context.action.model.as_deref();
    let provider_type = context.provider.provider_type.clone();

    info!(
        action_id = %context.action.id,
        action_name = %context.action.name,
        provider_id = %context.provider.id,
        provider_type = ?provider_type,
        model = model.unwrap_or("<provider-default>"),
        selected_text_chars,
        max_tokens = context.max_tokens,
        "Running action"
    );

    let provider_result = match provider_type {
        ProviderType::OpenAI => {
            openai::call_openai(&context.provider, &user_message, model, context.max_tokens).await?
        }
        ProviderType::Anthropic => {
            anthropic::call_anthropic(&context.provider, &user_message, model, context.max_tokens)
                .await?
        }
        ProviderType::Cli => {
            #[cfg(feature = "cli-provider")]
            {
                cli::call_cli(&context.provider, &user_message).await?
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

    let result: LlmResult = serde_json::from_value(provider_result).map_err(|_| {
        error!(action_id = %context.action.id, "Provider returned an invalid response payload");
        AppError::InvalidResponse
    })?;

    info!(
        action_id = %context.action.id,
        result_chars = result.result.chars().count(),
        "Action completed"
    );

    Ok(result.result)
}

const PROVIDER_TEST_MAX_TOKENS: u32 = 64;
const PROVIDER_TEST_MESSAGE: &str = "Reply with exactly: {\"result\": \"ok\"}";

#[cfg_attr(test, allow(dead_code))]
pub(crate) async fn test_provider_connection(provider: &Provider) -> Result<String, AppError> {
    let model = provider.default_model.as_deref();

    let provider_result = match provider.provider_type {
        ProviderType::OpenAI => {
            openai::call_openai(
                provider,
                PROVIDER_TEST_MESSAGE,
                model,
                PROVIDER_TEST_MAX_TOKENS,
            )
            .await?
        }
        ProviderType::Anthropic => {
            anthropic::call_anthropic(
                provider,
                PROVIDER_TEST_MESSAGE,
                model,
                PROVIDER_TEST_MAX_TOKENS,
            )
            .await?
        }
        ProviderType::Cli | ProviderType::Apple => {
            return Err(AppError::Config(
                "Only API providers can be tested with this command.".into(),
            ));
        }
    };

    let result: LlmResult = serde_json::from_value(provider_result).map_err(|_| {
        error!(provider_id = %provider.id, "Provider test returned an invalid response payload");
        AppError::InvalidResponse
    })?;

    Ok(format!(
        "Connection successful. Provider responded: {}",
        result.result
    ))
}

/// Records the outcome of an action run to history, if history is enabled.
///
/// History I/O is synchronous `std::fs` work; running it on a Tokio blocking
/// thread instead of directly in the caller's async task avoids stalling
/// that worker thread while the file is written.
#[cfg_attr(test, allow(dead_code))]
pub(crate) async fn record_action_history(
    context: &ActionContext,
    input_text: String,
    result: &Result<String, AppError>,
) {
    if !context.history_enabled {
        return;
    }

    let (output_text, success) = match result {
        Ok(output) => (output.clone(), true),
        Err(err) => (err.to_string(), false),
    };
    let action_name = context.action.name.clone();
    let provider_name = context.provider.name.clone();
    let history_generation = context.history_generation;

    let write_result = tokio::task::spawn_blocking(move || {
        history::add_entry_if_generation(
            history_generation,
            action_name,
            provider_name,
            input_text,
            output_text,
            success,
        )
    })
    .await;

    match write_result {
        Ok(Ok(true)) => {}
        Ok(Ok(false)) => {
            info!(
                action_id = %context.action.id,
                "Skipped stale history entry after history was purged"
            );
        }
        Ok(Err(err)) => {
            error!(
                error = %err,
                action_id = %context.action.id,
                "Failed to log history entry"
            );
        }
        Err(join_err) => {
            error!(
                error = %join_err,
                action_id = %context.action.id,
                "History write task panicked"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;
    use std::sync::Mutex;

    fn make_test_config_state() -> ConfigState {
        let providers = vec![Provider {
            id: "anthropic-provider".into(),
            name: "Anthropic".into(),
            provider_type: ProviderType::Anthropic,
            endpoint: None,
            api_key: Some("sk-test-key".into()),
            headers: ProviderHeaders::new(),
            default_model: Some("claude-sonnet-4-20250514".into()),
            command: None,
            args: vec![],
        }];
        #[cfg(feature = "cli-provider")]
        let providers = {
            let mut providers = providers;
            providers.push(Provider {
                id: "cli-provider".into(),
                name: "CLI".into(),
                provider_type: ProviderType::Cli,
                endpoint: None,
                api_key: None,
                headers: ProviderHeaders::new(),
                default_model: None,
                command: Some("echo".into()),
                args: vec!["-n".into()],
            });
            providers
        };
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
                history_enabled: false,
                ..Default::default()
            },
        }))
    }

    #[test]
    fn test_action_context_returns_error_when_action_not_found() {
        let state = make_test_config_state();
        let result = ActionContext::from_state("nonexistent-action", &state);

        assert!(matches!(result, Err(AppError::ActionNotFound(_))));
    }

    #[test]
    fn test_action_context_from_action_uses_draft_values() {
        let state = make_test_config_state();
        let draft = Action {
            id: "action-with-provider".into(),
            name: "Draft name".into(),
            provider_id: "anthropic-provider".into(),
            user_prompt: "Draft prompt".into(),
            model: Some("draft-model".into()),
        };

        let context = ActionContext::from_action(draft, &state).unwrap();

        assert_eq!(context.action.name, "Draft name");
        assert_eq!(context.action.user_prompt, "Draft prompt");
        assert_eq!(context.action.model.as_deref(), Some("draft-model"));
    }

    #[test]
    fn test_action_context_returns_error_when_provider_not_found() {
        let state = make_test_config_state();
        let result = ActionContext::from_state("action-with-missing-provider", &state);

        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
        if let Err(AppError::ProviderNotFound(id)) = result {
            assert_eq!(id, "nonexistent-provider");
        }
    }

    #[test]
    fn test_action_context_error_message_contains_action_id() {
        let state = make_test_config_state();
        let result = ActionContext::from_state("missing-action", &state);

        assert!(result.unwrap_err().to_string().contains("missing-action"));
    }

    #[test]
    fn test_action_context_captures_notification_preference() {
        let state = ConfigState(Mutex::new(AppConfig {
            providers: vec![Provider {
                id: "p1".into(),
                name: "Test".into(),
                provider_type: ProviderType::Anthropic,
                endpoint: None,
                api_key: Some("sk-test".into()),
                headers: ProviderHeaders::new(),
                default_model: None,
                command: None,
                args: vec![],
            }],
            actions: vec![Action {
                id: "a1".into(),
                name: "Action".into(),
                provider_id: "p1".into(),
                user_prompt: "Test".into(),
                model: None,
            }],
            settings: AppSettings {
                show_notification_on_complete: false,
                history_enabled: false,
                ..Default::default()
            },
        }));

        let context = ActionContext::from_state("a1", &state).unwrap();

        assert!(!context.show_notification_on_complete);
    }

    #[test]
    fn test_action_context_captures_model_override() {
        let state = ConfigState(Mutex::new(AppConfig {
            providers: vec![Provider {
                id: "p1".into(),
                name: "Test".into(),
                provider_type: ProviderType::Anthropic,
                endpoint: None,
                api_key: Some("sk-test".into()),
                headers: ProviderHeaders::new(),
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

        let context = ActionContext::from_state("a1", &state).unwrap();

        assert_eq!(context.action.model, Some("override-model".into()));
    }

    #[tokio::test]
    async fn test_run_action_rejects_oversized_text_before_calling_provider() {
        let state = make_test_config_state();
        let context = ActionContext::from_state("action-with-provider", &state).unwrap();
        let oversized = "x".repeat(crate::config::MAX_SELECTED_TEXT_CHARS + 1);

        let result = run_action_with_context(&context, &oversized).await;

        assert!(
            matches!(result, Err(AppError::Config(message)) if message.contains("Selected text"))
        );
    }
}
