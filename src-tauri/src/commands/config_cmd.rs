use crate::config::{save_config, ConfigState};
use crate::error::AppError;
use crate::models::{Action, AppConfig, AppSettings, Provider};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_config(state: State<ConfigState>) -> Result<AppConfig, AppError> {
    Ok(state.0.lock().unwrap().clone())
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<ConfigState>) -> Result<(), AppError> {
    let mut config = state.0.lock().unwrap();
    config.settings = settings;
    save_config(&config)
}

// ── Providers ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_provider(
    mut provider: Provider,
    state: State<ConfigState>,
) -> Result<Provider, AppError> {
    provider.id = Uuid::new_v4().to_string();
    let mut config = state.0.lock().unwrap();
    config.providers.push(provider.clone());
    save_config(&config)?;
    Ok(provider)
}

#[tauri::command]
pub fn update_provider(provider: Provider, state: State<ConfigState>) -> Result<(), AppError> {
    let mut config = state.0.lock().unwrap();
    let pos = config
        .providers
        .iter()
        .position(|p| p.id == provider.id)
        .ok_or_else(|| AppError::ProviderNotFound(provider.id.clone()))?;
    config.providers[pos] = provider;
    save_config(&config)
}

#[tauri::command]
pub fn delete_provider(id: String, state: State<ConfigState>) -> Result<(), AppError> {
    let mut config = state.0.lock().unwrap();
    config.providers.retain(|p| p.id != id);
    save_config(&config)
}

// ── Actions ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_action(mut action: Action, state: State<ConfigState>) -> Result<Action, AppError> {
    action.id = Uuid::new_v4().to_string();
    let mut config = state.0.lock().unwrap();
    config.actions.push(action.clone());
    save_config(&config)?;
    Ok(action)
}

#[tauri::command]
pub fn update_action(action: Action, state: State<ConfigState>) -> Result<(), AppError> {
    let mut config = state.0.lock().unwrap();
    let pos = config
        .actions
        .iter()
        .position(|a| a.id == action.id)
        .ok_or_else(|| AppError::ActionNotFound(action.id.clone()))?;
    config.actions[pos] = action;
    save_config(&config)
}

#[tauri::command]
pub fn delete_action(id: String, state: State<ConfigState>) -> Result<(), AppError> {
    let mut config = state.0.lock().unwrap();
    config.actions.retain(|a| a.id != id);
    save_config(&config)
}

#[tauri::command]
pub fn reorder_actions(ids: Vec<String>, state: State<ConfigState>) -> Result<(), AppError> {
    let mut config = state.0.lock().unwrap();
    let mut reordered = Vec::new();
    for id in &ids {
        if let Some(action) = config.actions.iter().find(|a| &a.id == id).cloned() {
            reordered.push(action);
        }
    }
    config.actions = reordered;
    save_config(&config)
}
