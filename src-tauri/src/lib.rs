mod commands;
mod config;
mod error;
mod models;
mod providers;
pub mod service;

use commands::{config_cmd::*, llm_cmd::*, service_cmd::*, validate_cmd::*};
use config::{load_config, ConfigState};
use service::ServiceState;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};

// ── App bootstrap ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_config().unwrap_or_default();
    let service_state = ServiceState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(ConfigState(Mutex::new(config)))
        .manage(service_state.clone())
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
            // Validation
            validate_llm_response,
            // Services / picker
            get_pending_text,
            run_and_paste,
        ])
        .setup(move |app| {
            setup_tray(app)?;

            #[cfg(target_os = "macos")]
            {
                // Hide the Dock icon (menu bar app).
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                // Wire up the Services provider.
                let handle = app.handle().clone();
                service::init(service_state.clone(), move || {
                    if let Some(win) = handle.get_webview_window("picker") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                });
                service::register_service_provider();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let open_settings =
        MenuItem::with_id(app, "open_settings", "Open Settings...", true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit LLM Actions", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_settings, &separator, &quit])?;

    let _tray = TrayIconBuilder::new()
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
