#[cfg(not(test))]
use crate::config::{save_config, ConfigState};
use crate::error::AppError;
#[cfg(not(test))]
use crate::history;
#[cfg(not(test))]
use crate::models::AppSettings;
use crate::models::{Action, AppConfig, Provider, ProviderType};
#[cfg(feature = "cli-provider")]
#[cfg(not(test))]
use crate::providers::cli::validate_cli_command;
use crate::providers::http::validate_provider_endpoint;
#[cfg(not(test))]
use tauri::{AppHandle, State};
#[cfg(not(test))]
use tracing::{debug, info};
use uuid::Uuid;

// ── Pure business-logic helpers (pub(crate) so tests can call them) ──────────

fn ensure_single_apple_provider(config: &AppConfig, provider: &Provider) -> Result<(), AppError> {
    if provider.provider_type != ProviderType::Apple {
        return Ok(());
    }

    let duplicate_exists = config.providers.iter().any(|existing| {
        existing.provider_type == ProviderType::Apple && existing.id != provider.id
    });

    if duplicate_exists {
        return Err(AppError::Config(
            "Only one Apple Intelligence provider can be configured.".into(),
        ));
    }

    Ok(())
}

pub(crate) fn insert_provider(
    config: &mut AppConfig,
    provider: Provider,
) -> Result<Provider, AppError> {
    ensure_single_apple_provider(config, &provider)?;
    validate_provider_endpoint(&provider)?;
    let mut provider = provider;
    provider.id = Uuid::new_v4().to_string();
    config.providers.push(provider.clone());
    Ok(provider)
}

pub(crate) fn replace_provider(config: &mut AppConfig, provider: Provider) -> Result<(), AppError> {
    ensure_single_apple_provider(config, &provider)?;
    validate_provider_endpoint(&provider)?;
    let pos = config
        .providers
        .iter()
        .position(|p| p.id == provider.id)
        .ok_or_else(|| AppError::ProviderNotFound(provider.id.clone()))?;
    config.providers[pos] = provider;
    Ok(())
}

pub(crate) fn remove_provider(config: &mut AppConfig, id: &str) -> Result<(), AppError> {
    if !config.providers.iter().any(|p| p.id == id) {
        return Err(AppError::ProviderNotFound(id.to_string()));
    }

    config.providers.retain(|p| p.id != id);
    Ok(())
}

pub(crate) fn ensure_provider_deletable(config: &AppConfig, id: &str) -> Result<(), AppError> {
    let provider = config
        .providers
        .iter()
        .find(|provider| provider.id == id)
        .ok_or_else(|| AppError::ProviderNotFound(id.to_string()))?;

    if provider.provider_type == ProviderType::Apple {
        return Err(AppError::Config(
            "Apple Intelligence provider cannot be deleted".into(),
        ));
    }

    if config.actions.iter().any(|action| action.provider_id == id) {
        return Err(AppError::Config(
            "Cannot delete provider while actions use it. Remove or reassign those actions first."
                .into(),
        ));
    }

    Ok(())
}

fn ensure_action_provider_exists(config: &AppConfig, action: &Action) -> Result<(), AppError> {
    if config.providers.iter().any(|p| p.id == action.provider_id) {
        return Ok(());
    }

    Err(AppError::ProviderNotFound(action.provider_id.clone()))
}

pub(crate) fn insert_action(config: &mut AppConfig, action: Action) -> Result<Action, AppError> {
    ensure_action_provider_exists(config, &action)?;
    let mut action = action;
    action.id = Uuid::new_v4().to_string();
    config.actions.push(action.clone());
    Ok(action)
}

pub(crate) fn replace_action(config: &mut AppConfig, action: Action) -> Result<(), AppError> {
    ensure_action_provider_exists(config, &action)?;
    let pos = config
        .actions
        .iter()
        .position(|a| a.id == action.id)
        .ok_or_else(|| AppError::ActionNotFound(action.id.clone()))?;
    config.actions[pos] = action;
    Ok(())
}

pub(crate) fn remove_action(config: &mut AppConfig, id: &str) -> Result<(), AppError> {
    if !config.actions.iter().any(|a| a.id == id) {
        return Err(AppError::ActionNotFound(id.to_string()));
    }

    config.actions.retain(|a| a.id != id);
    Ok(())
}

pub(crate) fn apply_action_reorder(config: &mut AppConfig, ids: &[String]) -> Result<(), AppError> {
    if ids.len() != config.actions.len() {
        return Err(AppError::Config(
            "Action reorder must include every action exactly once".into(),
        ));
    }

    let mut reordered = Vec::new();
    for id in ids {
        if reordered.iter().any(|action: &Action| &action.id == id) {
            return Err(AppError::Config(format!(
                "Action reorder contains duplicate id: {id}"
            )));
        }

        let action = config
            .actions
            .iter()
            .find(|a| &a.id == id)
            .cloned()
            .ok_or_else(|| AppError::ActionNotFound(id.clone()))?;
        reordered.push(action);
    }
    config.actions = reordered;
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[cfg(not(test))]
fn mutate_config<T>(
    state: &State<ConfigState>,
    mutate: impl FnOnce(&mut AppConfig) -> Result<T, AppError>,
) -> Result<(T, AppConfig), AppError> {
    let mut config = state.lock()?;
    let value = mutate(&mut config)?;
    Ok((value, config.clone()))
}

#[cfg(not(test))]
#[tauri::command]
pub fn get_config(state: State<ConfigState>) -> Result<AppConfig, AppError> {
    let config = state.lock()?.clone();
    debug!(
        provider_count = config.providers.len(),
        action_count = config.actions.len(),
        "Config requested"
    );
    Ok(config)
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<(), AppError> {
    let (updated_config, history_being_disabled) = {
        let mut config = state.lock()?;
        let history_being_disabled = config.settings.history_enabled && !settings.history_enabled;
        config.settings = settings;
        (config.clone(), history_being_disabled)
    };

    save_config(&updated_config)?;
    if history_being_disabled {
        let _ = history::purge_history();
    }
    info!(
        max_tokens = updated_config.settings.max_tokens,
        show_notification_on_complete = updated_config.settings.show_notification_on_complete,
        "Saved app settings"
    );
    // Settings changes don't affect tray menu, no refresh needed
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
pub fn add_provider(
    provider: Provider,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<Provider, AppError> {
    let (result, updated_config) =
        mutate_config(&state, |config| insert_provider(config, provider))?;
    save_config(&updated_config)?;
    info!(
        provider_id = %result.id,
        provider_name = %result.name,
        provider_type = ?result.provider_type,
        "Added provider"
    );
    // Provider changes don't affect tray menu, no refresh needed
    Ok(result)
}

#[cfg(not(test))]
#[tauri::command]
pub fn update_provider(
    provider: Provider,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<(), AppError> {
    let provider_id = provider.id.clone();
    let provider_name = provider.name.clone();
    let provider_type = provider.provider_type.clone();
    let (_, updated_config) = mutate_config(&state, |config| replace_provider(config, provider))?;
    save_config(&updated_config)?;
    info!(
        provider_id = %provider_id,
        provider_name = %provider_name,
        provider_type = ?provider_type,
        "Updated provider"
    );
    // Provider changes don't affect tray menu, no refresh needed
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
pub fn delete_provider(
    id: String,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<(), AppError> {
    let (_, updated_config) = mutate_config(&state, |config| {
        ensure_provider_deletable(config, &id)?;
        remove_provider(config, &id)
    })?;
    save_config(&updated_config)?;
    info!(provider_id = %id, "Deleted provider");
    // Provider changes don't affect tray menu, no refresh needed
    Ok(())
}

#[cfg(feature = "cli-provider")]
#[cfg(not(test))]
#[tauri::command]
pub fn test_cli_command(command: String) -> Result<String, AppError> {
    let result = validate_cli_command(&command)?;
    debug!(command = %command, "Validated CLI command");
    Ok(result)
}

#[cfg(not(test))]
#[tauri::command]
pub fn add_action(
    action: Action,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<Action, AppError> {
    let (result, updated_config) = mutate_config(&state, |config| insert_action(config, action))?;
    save_config(&updated_config)?;

    crate::tray::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(
        action_id = %result.id,
        action_name = %result.name,
        provider_id = %result.provider_id,
        "Added action"
    );
    Ok(result)
}

#[cfg(not(test))]
#[tauri::command]
pub fn update_action(
    action: Action,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<(), AppError> {
    let action_id = action.id.clone();
    let action_name = action.name.clone();
    let provider_id = action.provider_id.clone();
    let (_, updated_config) = mutate_config(&state, |config| replace_action(config, action))?;
    save_config(&updated_config)?;

    crate::tray::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(
        action_id = %action_id,
        action_name = %action_name,
        provider_id = %provider_id,
        "Updated action"
    );
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
pub fn delete_action(
    id: String,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<(), AppError> {
    let (_, updated_config) = mutate_config(&state, |config| remove_action(config, &id))?;
    save_config(&updated_config)?;

    crate::tray::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(action_id = %id, "Deleted action");
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
pub fn reorder_actions(
    ids: Vec<String>,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<(), AppError> {
    let (_, updated_config) = mutate_config(&state, |config| apply_action_reorder(config, &ids))?;
    save_config(&updated_config)?;

    crate::tray::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(action_count = ids.len(), "Reordered actions");
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ProviderHeaders, ProviderType};

    fn stub_provider(id: &str) -> Provider {
        Provider {
            id: id.into(),
            name: format!("Provider {id}"),
            provider_type: ProviderType::Anthropic,
            endpoint: None,
            api_key: Some("key".into()),
            headers: ProviderHeaders::new(),
            default_model: None,
            command: None,
            args: vec![],
        }
    }

    fn stub_apple_provider(id: &str) -> Provider {
        Provider {
            id: id.into(),
            name: "Apple Intelligence".into(),
            provider_type: ProviderType::Apple,
            endpoint: None,
            api_key: None,
            headers: ProviderHeaders::new(),
            default_model: None,
            command: None,
            args: vec![],
        }
    }

    fn stub_action(id: &str, provider_id: &str) -> Action {
        Action {
            id: id.into(),
            name: format!("Action {id}"),
            provider_id: provider_id.into(),
            user_prompt: "Do something".into(),
            model: None,
        }
    }

    // ── insert_provider ───────────────────────────────────────────────────────

    #[test]
    fn test_insert_provider_replaces_id_with_uuid() {
        let mut config = AppConfig::default();
        let result = insert_provider(&mut config, stub_provider("original-id")).unwrap();
        assert_eq!(result.id.len(), 36, "UUID v4 should be 36 chars");
        assert_ne!(result.id, "original-id");
    }

    #[test]
    fn test_insert_provider_appends_to_list() {
        let mut config = AppConfig::default();
        insert_provider(&mut config, stub_provider("a")).unwrap();
        insert_provider(&mut config, stub_provider("b")).unwrap();
        assert_eq!(config.providers.len(), 2);
    }

    #[test]
    fn test_insert_provider_preserves_name() {
        let mut config = AppConfig::default();
        let mut p = stub_provider("x");
        p.name = "My Provider".into();
        let result = insert_provider(&mut config, p).unwrap();
        assert_eq!(result.name, "My Provider");
    }

    #[test]
    fn test_insert_provider_rejects_duplicate_apple_provider() {
        let mut config = AppConfig {
            providers: vec![stub_apple_provider("apple-1")],
            ..AppConfig::default()
        };

        let result = insert_provider(&mut config, stub_apple_provider("apple-2"));

        assert!(matches!(result, Err(AppError::Config(_))));
    }

    // ── replace_provider ──────────────────────────────────────────────────────

    #[test]
    fn test_replace_provider_updates_correct_entry() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1"), stub_provider("p2")],
            ..AppConfig::default()
        };
        let mut updated = stub_provider("p1");
        updated.name = "Updated Name".into();
        replace_provider(&mut config, updated).unwrap();
        assert_eq!(config.providers[0].name, "Updated Name");
        assert_eq!(config.providers[1].name, "Provider p2");
    }

    #[test]
    fn test_replace_provider_returns_error_for_missing_id() {
        let mut config = AppConfig::default();
        let result = replace_provider(&mut config, stub_provider("ghost"));
        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
    }

    #[test]
    fn test_replace_provider_rejects_changing_to_duplicate_apple_provider() {
        let mut config = AppConfig {
            providers: vec![stub_apple_provider("apple-1"), stub_provider("p2")],
            ..AppConfig::default()
        };
        let mut updated = stub_provider("p2");
        updated.provider_type = ProviderType::Apple;

        let result = replace_provider(&mut config, updated);

        assert!(matches!(result, Err(AppError::Config(_))));
    }

    // ── remove_provider ───────────────────────────────────────────────────────

    #[test]
    fn test_remove_provider_deletes_correct_entry() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1"), stub_provider("p2")],
            ..AppConfig::default()
        };
        remove_provider(&mut config, "p1").unwrap();
        assert_eq!(config.providers.len(), 1);
        assert_eq!(config.providers[0].id, "p2");
    }

    #[test]
    fn test_remove_provider_returns_error_for_unknown_id() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };
        let result = remove_provider(&mut config, "nonexistent");

        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
        assert_eq!(config.providers.len(), 1);
    }

    #[test]
    fn test_ensure_provider_deletable_rejects_apple_provider() {
        let config = AppConfig {
            providers: vec![stub_apple_provider("apple-intelligence")],
            ..AppConfig::default()
        };

        let result = ensure_provider_deletable(&config, "apple-intelligence");

        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[test]
    fn test_ensure_provider_deletable_allows_non_apple_provider() {
        let config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };

        let result = ensure_provider_deletable(&config, "p1");

        assert!(result.is_ok());
    }

    #[test]
    fn test_ensure_provider_deletable_rejects_provider_used_by_action() {
        let config = AppConfig {
            providers: vec![stub_provider("p1")],
            actions: vec![stub_action("a1", "p1")],
            ..AppConfig::default()
        };

        let result = ensure_provider_deletable(&config, "p1");

        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[test]
    fn test_ensure_provider_deletable_rejects_missing_provider() {
        let config = AppConfig::default();

        let result = ensure_provider_deletable(&config, "missing");

        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
    }

    // ── insert_action ─────────────────────────────────────────────────────────

    #[test]
    fn test_insert_action_replaces_id_with_uuid() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };
        let result = insert_action(&mut config, stub_action("old-id", "p1")).unwrap();
        assert_eq!(result.id.len(), 36);
        assert_ne!(result.id, "old-id");
        assert_eq!(config.actions.len(), 1);
    }

    #[test]
    fn test_insert_action_preserves_prompt() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };
        let mut a = stub_action("x", "p1");
        a.user_prompt = "Custom prompt".into();
        let result = insert_action(&mut config, a).unwrap();
        assert_eq!(result.user_prompt, "Custom prompt");
    }

    #[test]
    fn test_insert_action_rejects_missing_provider() {
        let mut config = AppConfig::default();
        let result = insert_action(&mut config, stub_action("a1", "missing"));
        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
    }

    // ── replace_action ────────────────────────────────────────────────────────

    #[test]
    fn test_replace_action_updates_correct_entry() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            actions: vec![stub_action("a1", "p1"), stub_action("a2", "p1")],
            ..AppConfig::default()
        };
        let mut updated = stub_action("a1", "p1");
        updated.name = "Renamed".into();
        replace_action(&mut config, updated).unwrap();
        assert_eq!(config.actions[0].name, "Renamed");
        assert_eq!(config.actions[1].name, "Action a2");
    }

    #[test]
    fn test_replace_action_validates_provider_before_action_id() {
        let mut config = AppConfig::default();
        let result = replace_action(&mut config, stub_action("ghost", "p1"));
        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
    }

    #[test]
    fn test_replace_action_rejects_missing_action_after_provider_validation() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };
        let result = replace_action(&mut config, stub_action("ghost", "p1"));
        assert!(matches!(result, Err(AppError::ActionNotFound(_))));
    }

    // ── remove_action ─────────────────────────────────────────────────────────

    #[test]
    fn test_remove_action_deletes_correct_entry() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1"), stub_action("a2", "p1")],
            ..AppConfig::default()
        };
        remove_action(&mut config, "a1").unwrap();
        assert_eq!(config.actions.len(), 1);
        assert_eq!(config.actions[0].id, "a2");
    }

    #[test]
    fn test_remove_action_returns_error_for_unknown_id() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1")],
            ..AppConfig::default()
        };
        let result = remove_action(&mut config, "nonexistent");

        assert!(matches!(result, Err(AppError::ActionNotFound(_))));
        assert_eq!(config.actions.len(), 1);
    }

    // ── apply_action_reorder ──────────────────────────────────────────────────

    #[test]
    fn test_apply_action_reorder_changes_order() {
        let mut config = AppConfig {
            actions: vec![
                stub_action("a1", "p1"),
                stub_action("a2", "p1"),
                stub_action("a3", "p1"),
            ],
            ..AppConfig::default()
        };
        apply_action_reorder(&mut config, &["a3".into(), "a1".into(), "a2".into()]).unwrap();
        assert_eq!(config.actions[0].id, "a3");
        assert_eq!(config.actions[1].id, "a1");
        assert_eq!(config.actions[2].id, "a2");
    }

    #[test]
    fn test_apply_action_reorder_rejects_unknown_ids() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1"), stub_action("a2", "p1")],
            ..AppConfig::default()
        };
        let result = apply_action_reorder(&mut config, &["a2".into(), "unknown".into()]);
        assert!(matches!(result, Err(AppError::ActionNotFound(_))));
        assert_eq!(config.actions.len(), 2);
    }

    #[test]
    fn test_apply_action_reorder_rejects_empty_ids_when_actions_exist() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1")],
            ..AppConfig::default()
        };
        let result = apply_action_reorder(&mut config, &[]);
        assert!(matches!(result, Err(AppError::Config(_))));
        assert_eq!(config.actions.len(), 1);
    }

    #[test]
    fn test_apply_action_reorder_rejects_partial_ids() {
        let mut config = AppConfig {
            actions: vec![
                stub_action("a1", "p1"),
                stub_action("a2", "p1"),
                stub_action("a3", "p1"),
            ],
            ..AppConfig::default()
        };
        let result = apply_action_reorder(&mut config, &["a3".into(), "a1".into()]);
        assert!(matches!(result, Err(AppError::Config(_))));
        assert_eq!(config.actions.len(), 3);
    }

    #[test]
    fn test_apply_action_reorder_rejects_duplicate_ids() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1"), stub_action("a2", "p1")],
            ..AppConfig::default()
        };
        let result = apply_action_reorder(&mut config, &["a1".into(), "a1".into()]);
        assert!(matches!(result, Err(AppError::Config(_))));
    }
}
