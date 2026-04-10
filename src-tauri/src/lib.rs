mod commands;
mod config;
mod error;
mod history;
mod logging;
mod models;
mod providers;
mod retry;
pub mod service;

use commands::{config_cmd::*, history_cmd::*, llm_cmd::*};
use config::{load_config, ConfigState};
use models::AppConfig;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::Menu,
    menu::MenuItem,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;
use tracing::{debug, error, info, warn};

const TRAY_ID: &str = "main";
const TRAY_ACTION_PREFIX: &str = "tray_action:";
const NOTIFICATION_PREVIEW_LIMIT: usize = 120;

// ── App bootstrap ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_path = logging::init_logging();
    match &log_path {
        Some(path) => info!(log_file = %path.display(), "Logging initialized"),
        None => warn!("File logging unavailable; continuing with stderr logging only"),
    }

    let config = match load_config() {
        Ok(config) => config,
        Err(err) => {
            error!(error = %err, "Failed to load config; using defaults instead");
            AppConfig::default()
        }
    };

    info!(
        provider_count = config.providers.len(),
        action_count = config.actions.len(),
        "Starting LLM Actions"
    );

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ConfigState(Mutex::new(config)))
        .invoke_handler(tauri::generate_handler![
            // Config commands
            get_config,
            save_settings,
            add_provider,
            update_provider,
            delete_provider,
            test_cli_command,
            add_action,
            update_action,
            delete_action,
            reorder_actions,
            // LLM commands
            run_action,
            test_action,
            // History commands
            get_history,
            clear_history,
            delete_history_entry,
        ])
        .setup(move |app| {
            info!("Setting up Tauri application");
            setup_tray(app)?;
            setup_settings_window(app)?;
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            Ok(())
        });

    if let Err(err) = app.run(tauri::generate_context!()) {
        error!(error = %err, "Error while running Tauri application");
        panic!("error while running tauri application: {err}");
    }
}

pub(crate) fn refresh_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    config: &AppConfig,
) -> tauri::Result<()> {
    debug!(action_count = config.actions.len(), "Refreshing tray menu");
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(build_tray_menu(app, config)?))?;
    }
    Ok(())
}

fn build_tray_menu<R: Runtime, M: Manager<R>>(
    app: &M,
    config: &AppConfig,
) -> tauri::Result<Menu<R>> {
    debug!(action_count = config.actions.len(), "Building tray menu");
    let action_items: Vec<MenuItem<R>> = if config.actions.is_empty() {
        vec![MenuItem::with_id(
            app,
            "tray_no_actions",
            "(No custom actions)",
            false,
            None::<&str>,
        )?]
    } else {
        config
            .actions
            .iter()
            .map(|action| {
                MenuItem::with_id(
                    app,
                    format!("{TRAY_ACTION_PREFIX}{}", action.id),
                    &action.name,
                    true,
                    None::<&str>,
                )
            })
            .collect::<tauri::Result<Vec<_>>>()?
    };

    let open_settings =
        MenuItem::with_id(app, "open_settings", "Open Settings...", true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit LLM Actions", true, None::<&str>)?;
    let mut menu_items: Vec<&dyn tauri::menu::IsMenuItem<R>> = action_items
        .iter()
        .map(|item| item as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    menu_items.push(&separator as &dyn tauri::menu::IsMenuItem<R>);
    menu_items.push(&open_settings as &dyn tauri::menu::IsMenuItem<R>);
    menu_items.push(&quit as &dyn tauri::menu::IsMenuItem<R>);

    let menu = Menu::with_items(app, &menu_items)?;
    Ok(menu)
}

fn notification_preview(text: &str) -> String {
    let single_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if single_line.chars().count() <= NOTIFICATION_PREVIEW_LIMIT {
        return single_line;
    }

    single_line
        .chars()
        .take(NOTIFICATION_PREVIEW_LIMIT)
        .collect::<String>()
        + "..."
}

fn read_clipboard_text<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(crate::service::read_clipboard_text());
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())
}

fn write_clipboard_text<R: Runtime>(app: &AppHandle<R>, text: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        crate::service::write_clipboard_text(&text);
        let _ = tx.send(());
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn run_tray_action<R: Runtime>(app: AppHandle<R>, action_id: String) {
    tauri::async_runtime::spawn(async move {
        info!(action_id = %action_id, "Tray action requested");

        let clipboard_text = match read_clipboard_text(&app) {
            Ok(Some(text)) if !text.trim().is_empty() => text,
            Ok(_) => {
                info!(action_id = %action_id, "Tray action skipped because clipboard was empty");
                let _ = app
                    .notification()
                    .builder()
                    .title("LLM Actions")
                    .body("Clipboard does not contain any text to transform.")
                    .show();
                return;
            }
            Err(err) => {
                error!(action_id = %action_id, error = %err, "Failed to read clipboard for tray action");
                let _ = app
                    .notification()
                    .builder()
                    .title("LLM Actions")
                    .body(format!("Could not read the clipboard: {err}"))
                    .show();
                return;
            }
        };

        let (action_name, provider_name, show_notification_on_complete) = {
            let config_state = app.state::<ConfigState>();
            let config = match config_state.lock() {
                Ok(c) => c,
                Err(e) => {
                    error!(action_id = %action_id, error = %e, "Failed to access config for tray action");
                    let _ = app
                        .notification()
                        .builder()
                        .title("LLM Actions")
                        .body(format!("Failed to access config: {e}"))
                        .show();
                    return;
                }
            };
            let action = match config.actions.iter().find(|a| a.id == action_id) {
                Some(action) => action.clone(),
                None => {
                    warn!(action_id = %action_id, "Tray action could not be found");
                    let _ = app
                        .notification()
                        .builder()
                        .title("LLM Actions")
                        .body("That action could not be found.")
                        .show();
                    return;
                }
            };
            let provider = config.providers.iter().find(|p| p.id == action.provider_id);
            let provider_name = provider.map(|p| p.name.clone()).unwrap_or_default();
            (action.name, provider_name, config.settings.show_notification_on_complete)
        };

        let action_id_for_logs = action_id.clone();
        let clipboard_text_for_history = clipboard_text.clone();
        info!(
            action_id = %action_id_for_logs,
            action_name = %action_name,
            provider_name = %provider_name,
            clipboard_chars = clipboard_text.chars().count(),
            show_notification_on_complete,
            "Processing tray action"
        );

        // Show processing notification to give immediate feedback
        let _ = app
            .notification()
            .builder()
            .title("LLM Actions")
            .body(format!("Processing \"{}\"...", action_name))
            .show();

        let result = {
            let config_state = app.state::<ConfigState>();
            run_action_inner(action_id, clipboard_text, &config_state).await
        };

        match result {
            Ok(text) => {
                // Log to history if enabled
                let history_enabled = {
                    let config_state = app.state::<ConfigState>();
                    config_state.lock().map(|c| c.settings.history_enabled).unwrap_or(false)
                };

                if history_enabled {
                    let _ = history::add_entry(
                        action_name.clone(),
                        provider_name.clone(),
                        clipboard_text_for_history.clone(),
                        text.clone(),
                        true,
                    ).map_err(|e| {
                        error!(
                            error = %e,
                            action_id = %action_id_for_logs,
                            "Failed to log history entry"
                        )
                    });
                }

                if let Err(err) = write_clipboard_text(&app, text.clone()) {
                    error!(action_id = %action_id_for_logs, error = %err, "Failed to write clipboard for tray action");
                    let _ = app
                        .notification()
                        .builder()
                        .title("LLM Actions")
                        .body(format!("Could not write the clipboard: {err}"))
                        .show();
                    return;
                }

                info!(
                    action_id = %action_id_for_logs,
                    action_name = %action_name,
                    result_chars = text.chars().count(),
                    "Tray action completed"
                );

                if show_notification_on_complete {
                    let preview = notification_preview(&text);
                    let _ = app
                        .notification()
                        .builder()
                        .title("LLM Actions")
                        .body(format!(
                            "\"{action_name}\" finished. Copied to clipboard: {preview}"
                        ))
                        .show();
                }
            }
            Err(err) => {
                // Log failed history entry if enabled
                let history_enabled = {
                    let config_state = app.state::<ConfigState>();
                    config_state.lock().map(|c| c.settings.history_enabled).unwrap_or(false)
                };

                if history_enabled {
                    let _ = history::add_entry(
                        action_name.clone(),
                        provider_name,
                        clipboard_text_for_history,
                        err.to_string(),
                        false,
                    ).map_err(|e| {
                        error!(
                            error = %e,
                            action_id = %action_id_for_logs,
                            "Failed to log history entry"
                        )
                    });
                }

                error!(action_id = %action_id_for_logs, error = %err, "Tray action failed");
                let _ = app
                    .notification()
                    .builder()
                    .title("LLM Actions")
                    .body(err.to_string())
                    .show();
            }
        }
    });
}

fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let config = app
        .state::<ConfigState>()
        .lock()
        .map_err(|e| tauri::Error::Anyhow(e.into()))?
        .clone();
    let menu = build_tray_menu(app, &config)?;

    info!(action_count = config.actions.len(), "Setting up tray icon");

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open_settings" => {
                info!("Tray menu requested settings window");
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                info!("Tray menu requested app quit");
                app.exit(0);
            }
            id if id.starts_with(TRAY_ACTION_PREFIX) => {
                info!(action_id = %id.trim_start_matches(TRAY_ACTION_PREFIX), "Tray menu selected action");
                run_tray_action(
                    app.clone(),
                    id.trim_start_matches(TRAY_ACTION_PREFIX).to_string(),
                );
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                debug!("Tray icon left click opened settings window");
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_settings_window<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        debug!("Configuring settings window close behavior");
        let window_handle = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_handle.hide();
            }
        });
    }

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── notification_preview ─────────────────────────────────────────────────────

    #[test]
    fn test_notification_preview_short_text_unchanged() {
        let text = "Short text";
        assert_eq!(notification_preview(text), "Short text");
    }

    #[test]
    fn test_notification_preview_at_exact_limit() {
        let text = "a".repeat(NOTIFICATION_PREVIEW_LIMIT);
        assert_eq!(notification_preview(&text), text);
        assert_eq!(notification_preview(&text).chars().count(), NOTIFICATION_PREVIEW_LIMIT);
    }

    #[test]
    fn test_notification_preview_truncates_at_limit() {
        let text = "a".repeat(NOTIFICATION_PREVIEW_LIMIT + 10);
        let result = notification_preview(&text);
        assert_eq!(result.chars().count(), NOTIFICATION_PREVIEW_LIMIT + 3); // +3 for "..."
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_notification_preview_collapses_whitespace() {
        let text = "This  has    multiple   spaces\tand\nnewlines";
        let result = notification_preview(text);
        assert_eq!(result, "This has multiple spaces and newlines");
    }

    #[test]
    fn test_notification_preview_handles_multiline() {
        let text = "Line one\nLine two\nLine three";
        let result = notification_preview(text);
        assert_eq!(result, "Line one Line two Line three");
    }

    #[test]
    fn test_notification_preview_empty_string() {
        assert_eq!(notification_preview(""), "");
    }

    #[test]
    fn test_notification_preview_only_whitespace() {
        assert_eq!(notification_preview("   \n\t  "), "");
    }

    #[test]
    fn test_notification_preview_unicode_char_counting() {
        // Use emoji and wide chars - count should be unicode chars, not bytes
        let text = "😀😀😀"; // 3 chars, 12 bytes
        assert_eq!(notification_preview(text).chars().count(), 3);
    }

    #[test]
    fn test_notification_preview_truncates_unicode_correctly() {
        // Ensure truncation doesn't split multi-byte chars
        let text = "😀".repeat(NOTIFICATION_PREVIEW_LIMIT + 10);
        let result = notification_preview(&text);
        assert!(result.is_char_boundary(NOTIFICATION_PREVIEW_LIMIT));
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_notification_preview_preserves_trailing_content_after_truncation() {
        let text = "a".repeat(NOTIFICATION_PREVIEW_LIMIT - 10) + "tail12345678";
        // Total length is (NOTIFICATION_PREVIEW_LIMIT - 10) + 18 = NOTIFICATION_PREVIEW_LIMIT + 8
        let result = notification_preview(&text);
        // Should show first NOTIFICATION_PREVIEW_LIMIT chars + "..."
        assert!(result.starts_with("a"));
        assert!(result.ends_with("..."));
        assert_eq!(result.chars().count(), NOTIFICATION_PREVIEW_LIMIT + 3); // +3 for "..."
    }

    // ── Constants ────────────────────────────────────────────────────────────────

    #[test]
    fn test_tray_action_prefix_constant() {
        assert_eq!(TRAY_ACTION_PREFIX, "tray_action:");
    }

    #[test]
    fn test_tray_id_constant() {
        assert_eq!(TRAY_ID, "main");
    }
}
