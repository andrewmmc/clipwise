#[cfg(not(test))]
use crate::config::{save_config, ConfigState};
use crate::config::{validate_action_fields, validate_provider_fields, validate_settings};
#[cfg(test)]
use crate::config::{MAX_MAX_TOKENS, MIN_MAX_TOKENS};
use crate::error::AppError;
#[cfg(not(test))]
use crate::history;
use crate::models::AppSettings;
use crate::models::{Action, AppConfig, Provider, ProviderType, APPLE_PROVIDER_ID};
#[cfg(feature = "cli-provider")]
#[cfg(not(test))]
use crate::providers::cli::validate_cli_command;
#[cfg(not(test))]
use tauri::{AppHandle, Manager};
#[cfg(not(test))]
use tracing::{debug, info, warn};
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

#[cfg(not(test))]
async fn validate_provider_capability(provider: &Provider) -> Result<(), AppError> {
    if provider.provider_type == ProviderType::Cli && !cfg!(feature = "cli-provider") {
        return Err(AppError::Config(
            "CLI providers are not available in this build.".into(),
        ));
    }

    if provider.provider_type == ProviderType::Apple {
        let (available, reason) = crate::providers::apple::check_availability().await?;
        if !available {
            return Err(AppError::Config(format!(
                "Apple Intelligence is not available on this Mac{}.",
                reason
                    .as_deref()
                    .map(|value| format!(" ({value})"))
                    .unwrap_or_default()
            )));
        }
    }

    Ok(())
}

pub(crate) fn insert_provider(
    config: &mut AppConfig,
    provider: Provider,
) -> Result<Provider, AppError> {
    validate_provider_fields(&provider)?;
    ensure_single_apple_provider(config, &provider)?;
    let mut provider = provider;
    provider.id = if provider.provider_type == ProviderType::Apple {
        APPLE_PROVIDER_ID.to_string()
    } else {
        Uuid::new_v4().to_string()
    };
    config.providers.push(provider.clone());
    Ok(provider)
}

/// The reserved Apple Intelligence provider's `id`/`type` invariant ("there is
/// exactly one Apple-typed provider, and it's the well-known one") is relied
/// on elsewhere (`ensure_single_apple_provider`, `apple_attach.rs`). The
/// Settings UI never exposes editing this provider, but `update_provider` is
/// a plain Tauri command with no such restriction, so guard it here too.
fn ensure_apple_provider_type_is_immutable(
    existing: &Provider,
    updated: &Provider,
) -> Result<(), AppError> {
    if existing.provider_type != updated.provider_type
        && (existing.provider_type == ProviderType::Apple
            || updated.provider_type == ProviderType::Apple)
    {
        return Err(AppError::Config(
            "Providers cannot be changed to or from the built-in Apple Intelligence type.".into(),
        ));
    }
    Ok(())
}

pub(crate) fn replace_provider(config: &mut AppConfig, provider: Provider) -> Result<(), AppError> {
    validate_provider_fields(&provider)?;
    ensure_single_apple_provider(config, &provider)?;
    let pos = config
        .providers
        .iter()
        .position(|p| p.id == provider.id)
        .ok_or_else(|| AppError::ProviderNotFound(provider.id.clone()))?;
    ensure_apple_provider_type_is_immutable(&config.providers[pos], &provider)?;
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
    validate_action_fields(&action)?;
    ensure_action_provider_exists(config, &action)?;
    let mut action = action;
    action.id = Uuid::new_v4().to_string();
    config.actions.push(action.clone());
    Ok(action)
}

pub(crate) fn replace_action(config: &mut AppConfig, action: Action) -> Result<(), AppError> {
    validate_action_fields(&action)?;
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

/// Applies `mutate` to `config`, persists the result via `persist`, and
/// rolls `config` back to its pre-mutation value if persisting fails.
///
/// Pulled out of `mutate_config` (which needs a live Tauri `State` and so
/// can't easily run under plain unit tests) so its rollback behavior can be
/// tested directly with a fake `persist` closure.
///
/// This matters for two reasons:
/// - If the caller holds a lock across this call, keeping the disk write
///   inside that same critical section prevents two concurrent mutations
///   from having their `persist` calls land out of order relative to their
///   in-memory snapshots, which could otherwise leave the file on disk
///   behind the in-memory state (a change appears applied, then silently
///   vanishes after a restart).
/// - If `persist` fails (disk full, permissions, etc.), rolling back means
///   the command's `Err` result matches reality instead of leaving an
///   unpersisted change silently active in memory for the rest of the
///   session.
pub(crate) fn mutate_and_persist<T>(
    config: &mut AppConfig,
    mutate: impl FnOnce(&mut AppConfig) -> Result<T, AppError>,
    persist: impl FnOnce(&AppConfig) -> Result<(), AppError>,
) -> Result<(T, AppConfig), AppError> {
    let previous = config.clone();
    let value = mutate(config)?;
    let snapshot = config.clone();

    if let Err(err) = persist(&snapshot) {
        *config = previous;
        return Err(err);
    }

    Ok((value, snapshot))
}

#[cfg(not(test))]
async fn run_config_worker<T>(
    app: AppHandle,
    operation: impl FnOnce(&mut AppConfig) -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError>
where
    T: Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let state = app.state::<ConfigState>();
        let mut config = state.lock()?;
        operation(&mut config)
    })
    .await
    .map_err(|err| AppError::Service(format!("Config persistence worker failed: {err}")))?
}

#[cfg(not(test))]
async fn mutate_config<T>(
    app: AppHandle,
    mutate: impl FnOnce(&mut AppConfig) -> Result<T, AppError> + Send + 'static,
) -> Result<(T, AppConfig), AppError>
where
    T: Send + 'static,
{
    run_config_worker(app, move |config| {
        mutate_and_persist(config, mutate, save_config)
    })
    .await
}

#[cfg(not(test))]
#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<AppConfig, AppError> {
    let config = run_config_worker(app, |config| Ok(config.clone())).await?;
    debug!(
        provider_count = config.providers.len(),
        action_count = config.actions.len(),
        "Config requested"
    );
    Ok(config)
}

#[cfg(not(test))]
#[tauri::command]
pub async fn save_settings(settings: AppSettings, app: AppHandle) -> Result<(), AppError> {
    validate_settings(&settings)?;

    let updated_config = run_config_worker(app, move |config| {
        let previous = config.clone();
        let history_being_disabled = config.settings.history_enabled && !settings.history_enabled;
        config.settings = settings;
        let updated_config = config.clone();

        if let Err(err) = save_config(&updated_config) {
            *config = previous;
            return Err(err);
        }

        if history_being_disabled {
            if let Err(purge_err) = history::purge_history() {
                *config = previous.clone();
                if let Err(rollback_err) = save_config(&previous) {
                    return Err(AppError::Service(format!(
                        "Failed to delete history ({purge_err}) and failed to restore settings ({rollback_err})"
                    )));
                }
                return Err(purge_err);
            }
        }
        Ok(updated_config)
    })
    .await?;
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
pub async fn add_provider(provider: Provider, app: AppHandle) -> Result<Provider, AppError> {
    validate_provider_capability(&provider).await?;
    let (result, _) = mutate_config(app, move |config| insert_provider(config, provider)).await?;
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
pub async fn update_provider(provider: Provider, app: AppHandle) -> Result<(), AppError> {
    validate_provider_capability(&provider).await?;
    let provider_id = provider.id.clone();
    let provider_name = provider.name.clone();
    let provider_type = provider.provider_type.clone();
    mutate_config(app, move |config| replace_provider(config, provider)).await?;
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
pub async fn delete_provider(id: String, app: AppHandle) -> Result<(), AppError> {
    let worker_id = id.clone();
    mutate_config(app, move |config| {
        ensure_provider_deletable(config, &worker_id)?;
        remove_provider(config, &worker_id)
    })
    .await?;
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
pub async fn add_action(action: Action, app: AppHandle) -> Result<Action, AppError> {
    let (result, updated_config) =
        mutate_config(app.clone(), move |config| insert_action(config, action)).await?;

    if let Err(err) = crate::tray::refresh_tray_menu(&app, &updated_config) {
        warn!(error = %err, "Action was added but tray menu refresh failed");
    }
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
pub async fn update_action(action: Action, app: AppHandle) -> Result<(), AppError> {
    let action_id = action.id.clone();
    let action_name = action.name.clone();
    let provider_id = action.provider_id.clone();
    let (_, updated_config) =
        mutate_config(app.clone(), move |config| replace_action(config, action)).await?;

    if let Err(err) = crate::tray::refresh_tray_menu(&app, &updated_config) {
        warn!(error = %err, "Action was updated but tray menu refresh failed");
    }
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
pub async fn delete_action(id: String, app: AppHandle) -> Result<(), AppError> {
    let worker_id = id.clone();
    let (_, updated_config) =
        mutate_config(app.clone(), move |config| remove_action(config, &worker_id)).await?;

    if let Err(err) = crate::tray::refresh_tray_menu(&app, &updated_config) {
        warn!(error = %err, "Action was deleted but tray menu refresh failed");
    }
    info!(action_id = %id, "Deleted action");
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
pub async fn reorder_actions(ids: Vec<String>, app: AppHandle) -> Result<(), AppError> {
    let worker_ids = ids.clone();
    let (_, updated_config) = mutate_config(app.clone(), move |config| {
        apply_action_reorder(config, &worker_ids)
    })
    .await?;

    if let Err(err) = crate::tray::refresh_tray_menu(&app, &updated_config) {
        warn!(error = %err, "Actions were reordered but tray menu refresh failed");
    }
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

    fn settings_with_max_tokens(max_tokens: u32) -> AppSettings {
        AppSettings {
            max_tokens,
            ..AppSettings::default()
        }
    }

    // ── validate_settings ─────────────────────────────────────────────────────

    #[test]
    fn test_validate_settings_accepts_in_range_max_tokens() {
        assert!(validate_settings(&settings_with_max_tokens(MIN_MAX_TOKENS)).is_ok());
        assert!(validate_settings(&settings_with_max_tokens(4096)).is_ok());
        assert!(validate_settings(&settings_with_max_tokens(MAX_MAX_TOKENS)).is_ok());
    }

    #[test]
    fn test_validate_settings_rejects_zero_max_tokens() {
        let result = validate_settings(&settings_with_max_tokens(0));
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[test]
    fn test_validate_settings_rejects_oversized_max_tokens() {
        let result = validate_settings(&settings_with_max_tokens(4_000_000));
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[test]
    fn test_validate_settings_rejects_just_above_upper_bound() {
        let result = validate_settings(&settings_with_max_tokens(MAX_MAX_TOKENS + 1));
        assert!(matches!(result, Err(AppError::Config(_))));
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

    #[test]
    fn test_insert_apple_provider_uses_reserved_id() {
        let mut config = AppConfig::default();

        let result = insert_provider(&mut config, stub_apple_provider("submitted-id")).unwrap();

        assert_eq!(result.id, APPLE_PROVIDER_ID);
        assert_eq!(config.providers[0].id, APPLE_PROVIDER_ID);
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

    #[test]
    fn test_replace_provider_rejects_changing_to_apple_provider() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };
        let mut updated = stub_provider("p1");
        updated.provider_type = ProviderType::Apple;
        updated.api_key = None;

        let result = replace_provider(&mut config, updated);

        assert!(matches!(result, Err(AppError::Config(_))));
        assert_eq!(config.providers[0].provider_type, ProviderType::Anthropic);
    }

    #[test]
    fn test_replace_provider_rejects_changing_apple_provider_type() {
        let mut config = AppConfig {
            providers: vec![stub_apple_provider("apple-1")],
            ..AppConfig::default()
        };
        let mut updated = stub_apple_provider("apple-1");
        updated.provider_type = ProviderType::OpenAI;
        updated.api_key = Some("key".into());

        let result = replace_provider(&mut config, updated);

        assert!(matches!(result, Err(AppError::Config(_))));
        assert_eq!(
            config.providers[0].provider_type,
            ProviderType::Apple,
            "the reserved Apple provider's type should be unchanged"
        );
    }

    #[test]
    fn test_replace_provider_allows_updating_non_type_fields_on_apple_provider() {
        let mut config = AppConfig {
            providers: vec![stub_apple_provider("apple-1")],
            ..AppConfig::default()
        };
        let mut updated = stub_apple_provider("apple-1");
        updated.name = "Renamed Apple Provider".into();

        replace_provider(&mut config, updated).unwrap();

        assert_eq!(config.providers[0].name, "Renamed Apple Provider");
        assert_eq!(config.providers[0].provider_type, ProviderType::Apple);
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

    // -- mutate_and_persist ------------------------------------------------------

    #[test]
    fn test_mutate_and_persist_returns_mutated_value_and_snapshot() {
        let mut config = AppConfig::default();
        let (result, snapshot) = mutate_and_persist(
            &mut config,
            |cfg| insert_provider(cfg, stub_provider("ignored")),
            |_| Ok(()),
        )
        .unwrap();

        assert_eq!(snapshot.providers.len(), 1);
        assert_eq!(result.id, snapshot.providers[0].id);
        assert_eq!(config.providers.len(), 1, "mutation should apply in place");
    }

    #[test]
    fn test_mutate_and_persist_rolls_back_when_persist_fails() {
        let mut config = AppConfig::default();
        let result = mutate_and_persist(
            &mut config,
            |cfg| insert_provider(cfg, stub_provider("ignored")),
            |_| Err(AppError::Io(std::io::Error::other("disk full"))),
        );

        assert!(matches!(result, Err(AppError::Io(_))));
        assert!(
            config.providers.is_empty(),
            "failed persist should roll the in-memory config back to its previous value"
        );
    }

    #[test]
    fn test_mutate_and_persist_does_not_call_persist_when_mutate_fails() {
        let mut config = AppConfig::default();
        let mut persist_calls = 0;
        let result = mutate_and_persist(
            &mut config,
            |cfg| remove_provider(cfg, "missing"),
            |_| {
                persist_calls += 1;
                Ok(())
            },
        );

        assert!(matches!(result, Err(AppError::ProviderNotFound(_))));
        assert_eq!(persist_calls, 0);
    }

    #[test]
    fn test_mutate_and_persist_preserves_prior_state_beyond_the_failed_change() {
        let mut config = AppConfig {
            providers: vec![stub_provider("p1")],
            ..AppConfig::default()
        };
        let result = mutate_and_persist(
            &mut config,
            |cfg| insert_provider(cfg, stub_provider("p2")),
            |_| Err(AppError::Io(std::io::Error::other("disk full"))),
        );

        assert!(result.is_err());
        assert_eq!(
            config.providers.len(),
            1,
            "pre-existing provider p1 should remain"
        );
        assert_eq!(config.providers[0].id, "p1");
    }
}
