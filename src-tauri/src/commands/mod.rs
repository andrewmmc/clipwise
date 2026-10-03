pub mod app_info_cmd;
pub mod apple_cmd;
pub mod config_cmd;
pub mod history_cmd;
pub mod llm_cmd;

use crate::error::AppError;

/// Runs a blocking closure (e.g. synchronous file I/O) on Tokio's blocking
/// thread pool instead of the async worker thread the calling command is
/// running on.
///
/// History and config reads/writes use plain `std::fs` calls; running them
/// directly inside an `async fn` command briefly blocks a Tokio worker
/// thread. The files involved are tiny today, but this keeps command
/// handlers well-behaved regardless of file size or a slow/networked data
/// directory (e.g. iCloud Drive).
pub(crate) async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|err| AppError::Service(format!("Background task panicked: {err}")))?
}
