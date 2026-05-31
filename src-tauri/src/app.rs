use crate::commands::{app_info_cmd::*, apple_cmd::*, config_cmd::*, history_cmd::*, llm_cmd::*};
use crate::config::{load_config, ConfigState};
use crate::models::AppConfig;
use std::sync::Mutex;
use tracing::{error, info, warn};

#[cfg(target_os = "macos")]
fn set_app_icon() {
    use objc2::AnyThread;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let icon_bytes = include_bytes!("../icons/128x128@2x.png");
    unsafe {
        let data = NSData::with_bytes(icon_bytes);
        if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
            if let Some(mtm) = MainThreadMarker::new() {
                let app = NSApplication::sharedApplication(mtm);
                app.setApplicationIconImage(Some(&image));
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_path = crate::logging::init_logging();
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
        "Starting Clipwise"
    );

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ConfigState(Mutex::new(config)))
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_config,
            save_settings,
            add_provider,
            update_provider,
            delete_provider,
            #[cfg(feature = "cli-provider")]
            test_cli_command,
            add_action,
            update_action,
            delete_action,
            reorder_actions,
            run_action,
            test_action,
            get_history,
            clear_history,
            delete_history_entry,
            toggle_star_entry,
            check_apple_model_availability,
            is_cli_provider_enabled,
        ])
        .setup(move |app| {
            info!("Setting up Tauri application");
            #[cfg(target_os = "macos")]
            set_app_icon();
            crate::tray::setup_tray(app)?;
            crate::window::setup_settings_window(app)?;
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::apple_attach::attach_apple_provider_async(handle).await;
            });

            Ok(())
        });

    if let Err(err) = app.run(tauri::generate_context!()) {
        error!(error = %err, "Error while running Tauri application");
        panic!("error while running tauri application: {err}");
    }
}
