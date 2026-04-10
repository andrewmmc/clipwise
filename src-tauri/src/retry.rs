use crate::error::AppError;
use std::time::Duration;
use tokio::time::sleep;
use tracing::warn;

/// Default retry configuration: 2 retries with exponential backoff starting at 500ms
pub const DEFAULT_MAX_RETRIES: u32 = 2;
const INITIAL_DELAY_MS: u64 = 500;

/// Checks if an HTTP error status code is transient and should be retried.
pub(crate) fn is_transient_error(status: u16) -> bool {
    matches!(status, 429 | 500 | 502 | 503 | 504)
}

/// Executes an async operation with retry on transient HTTP errors.
/// Retries on HTTP 429 (rate limited), 500, 502, 503, 504.
pub async fn with_http_retry<F, Fut, T>(mut operation: F) -> Result<T, AppError>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, AppError>>,
{
    let mut attempt = 0;
    let mut delay = Duration::from_millis(INITIAL_DELAY_MS);

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(err) if err.is_retryable() && attempt < DEFAULT_MAX_RETRIES => {
                warn!(
                    attempt = attempt + 1,
                    max_attempts = DEFAULT_MAX_RETRIES + 1,
                    retry_in_ms = delay.as_millis(),
                    error = %err,
                    "Transient provider error; retrying"
                );
                attempt += 1;
                sleep(delay).await;
                delay *= 2; // Exponential backoff
                continue;
            }
            Err(other) => {
                if attempt > 0 {
                    warn!(
                        attempts = attempt + 1,
                        error = %other,
                        "Provider request failed after retries"
                    );
                }
                return Err(other);
            }
        }
    }
}

const _: () = {
    assert!(DEFAULT_MAX_RETRIES >= 1 && DEFAULT_MAX_RETRIES <= 5);
    assert!(INITIAL_DELAY_MS >= 100 && INITIAL_DELAY_MS <= 5000);
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_transient_error_identifies_retryable_status_codes() {
        assert!(is_transient_error(429)); // Rate limited
        assert!(is_transient_error(500)); // Internal server error
        assert!(is_transient_error(502)); // Bad gateway
        assert!(is_transient_error(503)); // Service unavailable
        assert!(is_transient_error(504)); // Gateway timeout
    }

    #[test]
    fn test_is_transient_error_rejects_non_retryable_status_codes() {
        assert!(!is_transient_error(400)); // Bad request
        assert!(!is_transient_error(401)); // Unauthorized
        assert!(!is_transient_error(403)); // Forbidden
        assert!(!is_transient_error(404)); // Not found
        assert!(!is_transient_error(422)); // Unprocessable entity
    }
}
