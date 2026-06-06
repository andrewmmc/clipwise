use crate::config::ConfigState;
use crate::models::AppConfig;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};
use tauri_plugin_notification::NotificationExt;
use tracing::{debug, error, info};

const TRAY_ID: &str = "main";
const TRAY_ACTION_PREFIX: &str = "tray_action:";

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
    let quit = MenuItem::with_id(app, "quit", "Quit Clipwise", true, None::<&str>)?;
    let mut menu_items: Vec<&dyn tauri::menu::IsMenuItem<R>> = action_items
        .iter()
        .map(|item| item as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    menu_items.push(&separator as &dyn tauri::menu::IsMenuItem<R>);
    menu_items.push(&open_settings as &dyn tauri::menu::IsMenuItem<R>);
    menu_items.push(&quit as &dyn tauri::menu::IsMenuItem<R>);

    Menu::with_items(app, &menu_items)
}

fn set_tray_icon<R: Runtime>(app: &AppHandle<R>, bytes: &[u8]) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(img) = tauri::image::Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(img));
            #[cfg(target_os = "macos")]
            let _ = tray.set_icon_as_template(true);
        }
    }
}

fn run_tray_action<R: Runtime>(app: AppHandle<R>, action_id: String) {
    tauri::async_runtime::spawn(async move {
        info!(action_id = %action_id, "Tray action requested");

        let clipboard_text = match crate::clipboard::read_clipboard_text(&app) {
            Ok(Some(text)) if !text.trim().is_empty() => text,
            Ok(_) => {
                info!(action_id = %action_id, "Tray action skipped because clipboard was empty");
                let _ = app
                    .notification()
                    .builder()
                    .title("Clipwise")
                    .body("Clipboard does not contain any text to transform.")
                    .show();
                return;
            }
            Err(err) => {
                error!(action_id = %action_id, error = %err, "Failed to read clipboard for tray action");
                let _ = app
                    .notification()
                    .builder()
                    .title("Clipwise")
                    .body(format!("Could not read the clipboard: {err}"))
                    .show();
                return;
            }
        };

        let action_context = {
            let config_state = app.state::<ConfigState>();
            match crate::action_service::ActionContext::from_state(&action_id, &config_state) {
                Ok(context) => context,
                Err(err) => {
                    error!(action_id = %action_id, error = %err, "Failed to prepare tray action");
                    let body = if matches!(err, crate::error::AppError::ActionNotFound(_)) {
                        "That action could not be found.".to_string()
                    } else {
                        err.to_string()
                    };
                    let _ = app
                        .notification()
                        .builder()
                        .title("Clipwise")
                        .body(body)
                        .show();
                    return;
                }
            }
        };
        let show_notification_on_complete = action_context.show_notification_on_complete;

        let action_name = action_context.action.name.clone();
        let provider_name = action_context.provider.name.clone();
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

        let _ = app
            .notification()
            .builder()
            .title("Clipwise")
            .body(format!("Processing \"{}\"...", action_name))
            .show();

        set_tray_icon(&app, include_bytes!("../icons/tray-icon-loading-0.png"));
        let result =
            crate::action_service::run_action_with_context(&action_context, &clipboard_text).await;
        set_tray_icon(&app, include_bytes!("../icons/tray-icon.png"));

        crate::action_service::record_action_history(
            &action_context,
            clipboard_text_for_history,
            &result,
        );

        match result {
            Ok(text) => {
                if let Err(err) = crate::clipboard::write_clipboard_text(&app, text.clone()) {
                    error!(action_id = %action_id_for_logs, error = %err, "Failed to write clipboard for tray action");
                    let _ = app
                        .notification()
                        .builder()
                        .title("Clipwise")
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
                    let preview = crate::notifications::notification_preview(&text);
                    let _ = app
                        .notification()
                        .builder()
                        .title("Clipwise")
                        .body(format!(
                            "\"{action_name}\" finished. Copied to clipboard: {preview}"
                        ))
                        .show();
                }
            }
            Err(err) => {
                error!(action_id = %action_id_for_logs, error = %err, "Tray action failed");
                let _ = app
                    .notification()
                    .builder()
                    .title("Clipwise")
                    .body(err.to_string())
                    .show();
            }
        }
    });
}

pub(crate) fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let config = app
        .state::<ConfigState>()
        .lock()
        .map_err(|e| tauri::Error::Anyhow(e.into()))?
        .clone();
    let menu = build_tray_menu(app, &config)?;

    info!(action_count = config.actions.len(), "Setting up tray icon");

    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .expect("Failed to load tray icon");

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open_settings" => {
                info!("Tray menu requested settings window");
                crate::window::show_settings_window(app);
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
                debug!("Tray icon left click opened settings window");
                crate::window::show_settings_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tray_action_prefix_constant() {
        assert_eq!(TRAY_ACTION_PREFIX, "tray_action:");
    }

    #[test]
    fn test_tray_id_constant() {
        assert_eq!(TRAY_ID, "main");
    }
}
