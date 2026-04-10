use crate::config::{save_config, ConfigState};
use crate::error::AppError;
use crate::models::{Action, AppConfig, AppSettings, Provider};
use crate::providers::cli::validate_cli_command;
use tauri::{AppHandle, State};
use tracing::{debug, info};
use uuid::Uuid;

// ── Pure business-logic helpers (pub(crate) so tests can call them) ──────────

pub(crate) fn insert_provider(config: &mut AppConfig, provider: Provider) -> Provider {
    let mut provider = provider;
    provider.id = Uuid::new_v4().to_string();
    config.providers.push(provider.clone());
    provider
}

pub(crate) fn replace_provider(config: &mut AppConfig, provider: Provider) -> Result<(), AppError> {
    let pos = config
        .providers
        .iter()
        .position(|p| p.id == provider.id)
        .ok_or_else(|| AppError::ProviderNotFound(provider.id.clone()))?;
    config.providers[pos] = provider;
    Ok(())
}

pub(crate) fn remove_provider(config: &mut AppConfig, id: &str) {
    config.providers.retain(|p| p.id != id);
}

pub(crate) fn insert_action(config: &mut AppConfig, action: Action) -> Action {
    let mut action = action;
    action.id = Uuid::new_v4().to_string();
    config.actions.push(action.clone());
    action
}

pub(crate) fn replace_action(config: &mut AppConfig, action: Action) -> Result<(), AppError> {
    let pos = config
        .actions
        .iter()
        .position(|a| a.id == action.id)
        .ok_or_else(|| AppError::ActionNotFound(action.id.clone()))?;
    config.actions[pos] = action;
    Ok(())
}

pub(crate) fn remove_action(config: &mut AppConfig, id: &str) {
    config.actions.retain(|a| a.id != id);
}

pub(crate) fn apply_action_reorder(config: &mut AppConfig, ids: &[String]) {
    let mut reordered = Vec::new();
    for id in ids {
        if let Some(action) = config.actions.iter().find(|a| &a.id == id).cloned() {
            reordered.push(action);
        }
    }
    config.actions = reordered;
}

// ── Tauri commands ────────────────────────────────────────────────────────────

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

#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<(), AppError> {
    let mut config = state.lock()?;
    config.settings = settings;
    save_config(&config)?;
    info!(
        max_tokens = config.settings.max_tokens,
        show_notification_on_complete = config.settings.show_notification_on_complete,
        "Saved app settings"
    );
    // Settings changes don't affect tray menu, no refresh needed
    Ok(())
}

#[tauri::command]
pub fn add_provider(
    provider: Provider,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<Provider, AppError> {
    let mut config = state.lock()?;
    let result = insert_provider(&mut config, provider);
    save_config(&config)?;
    info!(
        provider_id = %result.id,
        provider_name = %result.name,
        provider_type = ?result.provider_type,
        "Added provider"
    );
    // Provider changes don't affect tray menu, no refresh needed
    Ok(result)
}

#[tauri::command]
pub fn update_provider(
    provider: Provider,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<(), AppError> {
    let provider_id = provider.id.clone();
    let provider_name = provider.name.clone();
    let provider_type = provider.provider_type.clone();
    let mut config = state.lock()?;
    replace_provider(&mut config, provider)?;
    save_config(&config)?;
    info!(
        provider_id = %provider_id,
        provider_name = %provider_name,
        provider_type = ?provider_type,
        "Updated provider"
    );
    // Provider changes don't affect tray menu, no refresh needed
    Ok(())
}

#[tauri::command]
pub fn delete_provider(
    id: String,
    state: State<ConfigState>,
    _app: AppHandle,
) -> Result<(), AppError> {
    let mut config = state.lock()?;
    remove_provider(&mut config, &id);
    save_config(&config)?;
    info!(provider_id = %id, "Deleted provider");
    // Provider changes don't affect tray menu, no refresh needed
    Ok(())
}

#[tauri::command]
pub fn test_cli_command(command: String) -> Result<String, AppError> {
    let result = validate_cli_command(&command)?;
    debug!(command = %command, "Validated CLI command");
    Ok(result)
}

#[tauri::command]
pub fn add_action(
    action: Action,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<Action, AppError> {
    let (result, updated_config) = {
        let mut config = state.lock()?;
        let result = insert_action(&mut config, action);
        save_config(&config)?;
        (result, config.clone())
    };

    crate::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(
        action_id = %result.id,
        action_name = %result.name,
        provider_id = %result.provider_id,
        "Added action"
    );
    Ok(result)
}

#[tauri::command]
pub fn update_action(
    action: Action,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<(), AppError> {
    let action_id = action.id.clone();
    let action_name = action.name.clone();
    let provider_id = action.provider_id.clone();
    let updated_config = {
        let mut config = state.lock()?;
        replace_action(&mut config, action)?;
        save_config(&config)?;
        config.clone()
    };

    crate::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(
        action_id = %action_id,
        action_name = %action_name,
        provider_id = %provider_id,
        "Updated action"
    );
    Ok(())
}

#[tauri::command]
pub fn delete_action(
    id: String,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<(), AppError> {
    let updated_config = {
        let mut config = state.lock()?;
        remove_action(&mut config, &id);
        save_config(&config)?;
        config.clone()
    };

    crate::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(action_id = %id, "Deleted action");
    Ok(())
}

#[tauri::command]
pub fn reorder_actions(
    ids: Vec<String>,
    state: State<ConfigState>,
    app: AppHandle,
) -> Result<(), AppError> {
    let updated_config = {
        let mut config = state.lock()?;
        apply_action_reorder(&mut config, &ids);
        save_config(&config)?;
        config.clone()
    };

    crate::refresh_tray_menu(&app, &updated_config)
        .map_err(|e| AppError::Service(e.to_string()))?;
    info!(action_count = ids.len(), "Reordered actions");
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ProviderType;

    fn stub_provider(id: &str) -> Provider {
        Provider {
            id: id.into(),
            name: format!("Provider {id}"),
            provider_type: ProviderType::Anthropic,
            endpoint: None,
            api_key: Some("key".into()),
            headers: serde_json::Map::new(),
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
        let result = insert_provider(&mut config, stub_provider("original-id"));
        assert_eq!(result.id.len(), 36, "UUID v4 should be 36 chars");
        assert_ne!(result.id, "original-id");
    }

    #[test]
    fn test_insert_provider_appends_to_list() {
        let mut config = AppConfig::default();
        insert_provider(&mut config, stub_provider("a"));
        insert_provider(&mut config, stub_provider("b"));
        assert_eq!(config.providers.len(), 2);
    }

    #[test]
    fn test_insert_provider_preserves_name() {
        let mut config = AppConfig::default();
        let mut p = stub_provider("x");
        p.name = "My Provider".into();
        let result = insert_provider(&mut config, p);
        assert_eq!(result.name, "My Provider");
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

    // ── remove_provider ───────────────────────────────────────────────────────

    #[test]
    fn test_remove_provider_deletes_correct_entry() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1"), stub_provider("p2")],
            ..AppConfig::default()
        };
        remove_provider(&mut config, "p1");
        assert_eq!(config.providers.len(), 1);
        assert_eq!(config.providers[0].id, "p2");
    }

    #[test]
    fn test_remove_provider_is_noop_for_unknown_id() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };
        remove_provider(&mut config, "nonexistent");
        assert_eq!(config.providers.len(), 1);
    }

    // ── insert_action ─────────────────────────────────────────────────────────

    #[test]
    fn test_insert_action_replaces_id_with_uuid() {
        let mut config = AppConfig::default();
        let result = insert_action(&mut config, stub_action("old-id", "p1"));
        assert_eq!(result.id.len(), 36);
        assert_ne!(result.id, "old-id");
        assert_eq!(config.actions.len(), 1);
    }

    #[test]
    fn test_insert_action_preserves_prompt() {
        let mut config = AppConfig::default();
        let mut a = stub_action("x", "p1");
        a.user_prompt = "Custom prompt".into();
        let result = insert_action(&mut config, a);
        assert_eq!(result.user_prompt, "Custom prompt");
    }

    // ── replace_action ────────────────────────────────────────────────────────

    #[test]
    fn test_replace_action_updates_correct_entry() {
        let mut config = AppConfig {
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
    fn test_replace_action_returns_error_for_missing_id() {
        let mut config = AppConfig::default();
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
        remove_action(&mut config, "a1");
        assert_eq!(config.actions.len(), 1);
        assert_eq!(config.actions[0].id, "a2");
    }

    #[test]
    fn test_remove_action_is_noop_for_unknown_id() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1")],
            ..AppConfig::default()
        };
        remove_action(&mut config, "nonexistent");
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
        apply_action_reorder(&mut config, &["a3".into(), "a1".into(), "a2".into()]);
        assert_eq!(config.actions[0].id, "a3");
        assert_eq!(config.actions[1].id, "a1");
        assert_eq!(config.actions[2].id, "a2");
    }

    #[test]
    fn test_apply_action_reorder_skips_unknown_ids() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1"), stub_action("a2", "p1")],
            ..AppConfig::default()
        };
        apply_action_reorder(&mut config, &["a2".into(), "unknown".into(), "a1".into()]);
        assert_eq!(config.actions.len(), 2);
        assert_eq!(config.actions[0].id, "a2");
        assert_eq!(config.actions[1].id, "a1");
    }

    #[test]
    fn test_apply_action_reorder_with_empty_ids_clears_actions() {
        let mut config = AppConfig {
            actions: vec![stub_action("a1", "p1")],
            ..AppConfig::default()
        };
        apply_action_reorder(&mut config, &[]);
        assert!(config.actions.is_empty());
    }

    #[test]
    fn test_apply_action_reorder_partial_ids_keeps_only_matched() {
        let mut config = AppConfig {
            actions: vec![
                stub_action("a1", "p1"),
                stub_action("a2", "p1"),
                stub_action("a3", "p1"),
            ],
            ..AppConfig::default()
        };
        // Only provide two of the three IDs
        apply_action_reorder(&mut config, &["a3".into(), "a1".into()]);
        assert_eq!(config.actions.len(), 2);
        assert_eq!(config.actions[0].id, "a3");
        assert_eq!(config.actions[1].id, "a1");
    }
}
