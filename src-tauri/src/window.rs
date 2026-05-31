use tauri::{AppHandle, Manager, Runtime, WindowEvent};
use tracing::debug;

pub(crate) fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("settings") {
        #[cfg(target_os = "macos")]
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.hide();
        #[cfg(target_os = "macos")]
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }
}

pub(crate) fn setup_settings_window<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        debug!("Configuring settings window close behavior");
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                hide_settings_window(&app_handle);
            }
        });
    }

    Ok(())
}
