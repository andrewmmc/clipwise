use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Runtime};

pub(crate) fn read_clipboard_text<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<String>, String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(crate::service::read_clipboard_text());
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())
}

pub(crate) fn write_clipboard_text<R: Runtime>(
    app: &AppHandle<R>,
    text: String,
) -> Result<(), String> {
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
