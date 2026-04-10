mod commands;
mod config;
mod error;
mod models;
mod providers;
mod retry;
pub mod service;

use commands::{config_cmd::*, llm_cmd::*};
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

const TRAY_ID: &str = "main";
const TRAY_ACTION_PREFIX: &str = "tray_action:";
const NOTIFICATION_PREVIEW_LIMIT: usize = 120;

// ── App bootstrap ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_config().unwrap_or_default();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(ConfigState(Mutex::new(config)))
        .invoke_handler(tauri::generate_handler![
            // Config commands
            get_config,
            save_settings,
            add_provider,
            update_provider,
            delete_provider,
            add_action,
            update_action,
            delete_action,
            reorder_actions,
            // LLM commands
            run_action,
            test_action,
        ])
        .setup(move |app| {
            setup_tray(app)?;
            setup_settings_window(app)?;
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub(crate) fn refresh_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    config: &AppConfig,
) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(build_tray_menu(app, config)?))?;
    }
    Ok(())
}

fn build_tray_menu<R: Runtime, M: Manager<R>>(
    app: &M,
    config: &AppConfig,
) -> tauri::Result<Menu<R>> {
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
    rx.recv_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())
}

fn write_clipboard_text<R: Runtime>(app: &AppHandle<R>, text: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        crate::service::write_clipboard_text(&text);
        let _ = tx.send(());
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    Ok(())
}

fn run_tray_action<R: Runtime>(app: AppHandle<R>, action_id: String) {
    tauri::async_runtime::spawn(async move {
        let clipboard_text = match read_clipboard_text(&app) {
            Ok(Some(text)) if !text.trim().is_empty() => text,
            Ok(_) => {
                let _ = app
                    .notification()
                    .builder()
                    .title("LLM Actions")
                    .body("Clipboard does not contain any text to transform.")
                    .show();
                return;
            }
            Err(err) => {
                let _ = app
                    .notification()
                    .builder()
                    .title("LLM Actions")
                    .body(format!("Could not read the clipboard: {err}"))
                    .show();
                return;
            }
        };

        let (action_name, show_notification_on_complete) = {
            let config_state = app.state::<ConfigState>();
            let config = match config_state.lock() {
                Ok(c) => c,
                Err(e) => {
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
                    let _ = app
                        .notification()
                        .builder()
                        .title("LLM Actions")
                        .body("That action could not be found.")
                        .show();
                    return;
                }
            };
            (action.name, config.settings.show_notification_on_complete)
        };

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
                if let Err(err) = write_clipboard_text(&app, text.clone()) {
                    let _ = app
                        .notification()
                        .builder()
                        .title("LLM Actions")
                        .body(format!("Could not write the clipboard: {err}"))
                        .show();
                    return;
                }

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
    let config = app.state::<ConfigState>().lock().unwrap().clone();
    let menu = build_tray_menu(app, &config)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open_settings" => {
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            id if id.starts_with(TRAY_ACTION_PREFIX) => {
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
