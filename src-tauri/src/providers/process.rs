use crate::error::AppError;
use std::process::ExitStatus;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::time::timeout;

const PROCESS_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_OUTPUT_BYTES: usize = 4 * 1024 * 1024;

pub(crate) struct ProcessOutput {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

async fn read_limited(reader: impl AsyncRead + Unpin) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader
        .take((MAX_OUTPUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .await?;

    if bytes.len() > MAX_OUTPUT_BYTES {
        return Err(std::io::Error::other(format!(
            "process output exceeded {MAX_OUTPUT_BYTES} bytes"
        )));
    }

    Ok(bytes)
}

pub(crate) async fn run_command(
    command: &mut Command,
    stdin: Option<&[u8]>,
    process_name: &str,
) -> Result<ProcessOutput, AppError> {
    command
        .stdin(if stdin.is_some() {
            std::process::Stdio::piped()
        } else {
            std::process::Stdio::null()
        })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let mut child = command
        .spawn()
        .map_err(|err| AppError::Llm(format!("Failed to spawn {process_name}: {err}")))?;

    let child_stdin = child.stdin.take();

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Llm(format!("{process_name} stdout was unavailable")))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Llm(format!("{process_name} stderr was unavailable")))?;

    let result = timeout(PROCESS_TIMEOUT, async {
        let write_stdin = async {
            if let Some(input) = stdin {
                let mut writer = child_stdin.ok_or_else(|| {
                    std::io::Error::other(format!("{process_name} stdin was unavailable"))
                })?;
                writer.write_all(input).await?;
                writer.shutdown().await?;
            }
            Ok::<_, std::io::Error>(())
        };
        let (_, stdout, stderr, status) = tokio::try_join!(
            write_stdin,
            read_limited(stdout),
            read_limited(stderr),
            child.wait()
        )?;
        Ok::<_, std::io::Error>(ProcessOutput {
            status,
            stdout,
            stderr,
        })
    })
    .await;

    match result {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            Err(AppError::Llm(format!("{process_name} failed: {err}")))
        }
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            Err(AppError::Llm(format!(
                "{process_name} timed out after {} seconds",
                PROCESS_TIMEOUT.as_secs()
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_run_command_rejects_excessive_output() {
        let mut command = Command::new("/usr/bin/yes");
        let result = run_command(&mut command, None, "test process").await;

        assert!(
            matches!(result, Err(AppError::Llm(message)) if message.contains("output exceeded"))
        );
    }
}
