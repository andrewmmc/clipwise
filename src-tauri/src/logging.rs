use std::error::Error;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

const LOG_FILE_NAME: &str = "clipwise.log";

pub fn init_logging() -> Option<PathBuf> {
    let log_path = match log_file_path() {
        Ok(path) => path,
        Err(err) => {
            init_stderr_only();
            eprintln!("Failed to resolve log file path: {err}");
            return None;
        }
    };

    match init_file_and_stderr_layers(&log_path) {
        Ok(()) => Some(log_path),
        Err(err) => {
            init_stderr_only();
            eprintln!(
                "Failed to initialize file logging at {}: {err}",
                log_path.display()
            );
            None
        }
    }
}

fn init_file_and_stderr_layers(log_path: &Path) -> Result<(), Box<dyn Error + Send + Sync>> {
    let log_dir = log_path
        .parent()
        .ok_or("log path is missing a parent directory")?;

    let file_appender = tracing_appender::rolling::never(log_dir, LOG_FILE_NAME);
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(default_env_filter())
        .with(
            fmt::layer()
                .compact()
                .with_target(true)
                .with_thread_ids(true)
                .with_writer(std::io::stderr),
        )
        .with(
            fmt::layer()
                .json()
                .with_ansi(false)
                .with_current_span(true)
                .with_span_list(true)
                .with_thread_ids(true)
                .with_writer(file_writer),
        )
        .try_init()?;

    // Keep the appender guard alive for the lifetime of the process so logs keep flushing.
    keep_guard_alive(guard);

    Ok(())
}

fn init_stderr_only() {
    let _ = tracing_subscriber::registry()
        .with(default_env_filter())
        .with(
            fmt::layer()
                .compact()
                .with_target(true)
                .with_thread_ids(true)
                .with_writer(std::io::stderr),
        )
        .try_init();
}

fn default_env_filter() -> EnvFilter {
    EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("info,reqwest=warn,hyper=warn,h2=warn,tao=warn,wry=warn,tauri=warn")
    })
}

fn log_file_path() -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    let base_dir = dirs::data_local_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join(".local").join("share")))
        .ok_or("cannot locate local app data directory")?;
    let log_dir = base_dir.join("clipwise").join("logs");
    fs::create_dir_all(&log_dir)?;
    Ok(log_dir.join(LOG_FILE_NAME))
}

fn keep_guard_alive(guard: WorkerGuard) {
    std::mem::forget(guard);
}
