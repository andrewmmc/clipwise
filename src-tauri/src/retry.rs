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

    // ── Retry behavior ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_with_http_retry_succeeds_on_first_attempt() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let call_count = AtomicUsize::new(0);
        let cc = &call_count as &AtomicUsize;

        let result = with_http_retry(move || async {
            cc.fetch_add(1, Ordering::SeqCst);
            Ok::<_, AppError>("success")
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_with_http_retry_retries_on_transient_error() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let call_count = AtomicUsize::new(0);
        let cc = &call_count as &AtomicUsize;

        let result = with_http_retry(move || async {
            let current = cc.fetch_add(1, Ordering::SeqCst) + 1;

            if current < 2 {
                Err::<String, _>(AppError::NetworkError)
            } else {
                Ok("success".to_string())
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(call_count.load(Ordering::SeqCst), 2); // Failed once, succeeded on retry
    }

    #[tokio::test]
    async fn test_with_http_retry_fails_after_max_retries() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let call_count = AtomicUsize::new(0);
        let cc = &call_count as &AtomicUsize;

        let result = with_http_retry(move || async {
            cc.fetch_add(1, Ordering::SeqCst);
            Err::<String, _>(AppError::NetworkError)
        })
        .await;

        assert!(result.is_err());
        // Should be called DEFAULT_MAX_RETRIES + 1 times (initial + retries)
        assert_eq!(call_count.load(Ordering::SeqCst), (DEFAULT_MAX_RETRIES + 1) as usize);
    }

    #[tokio::test]
    async fn test_with_http_retry_does_not_retry_non_retryable_errors() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let call_count = AtomicUsize::new(0);
        let cc = &call_count as &AtomicUsize;

        let result = with_http_retry(move || async {
            cc.fetch_add(1, Ordering::SeqCst);
            Err::<String, _>(AppError::AuthError)
        })
        .await;

        assert!(result.is_err());
        assert_eq!(call_count.load(Ordering::SeqCst), 1); // Should not retry auth errors
    }

    #[tokio::test]
    async fn test_with_http_retry_retries_on_rate_limit() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let call_count = AtomicUsize::new(0);
        let cc = &call_count as &AtomicUsize;

        let result = with_http_retry(move || async {
            let current = cc.fetch_add(1, Ordering::SeqCst) + 1;

            if current < 3 {
                Err::<String, _>(AppError::RateLimited)
            } else {
                Ok("success".to_string())
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(call_count.load(Ordering::SeqCst), 3);
    }

    // ── Constants validation ────────────────────────────────────────────────────

    #[test]
    fn test_default_max_retries_is_reasonable() {
        assert!(DEFAULT_MAX_RETRIES >= 1, "should retry at least once");
        assert!(DEFAULT_MAX_RETRIES <= 5, "should not retry excessively");
    }

    #[test]
    fn test_initial_delay_is_reasonable() {
        assert!(INITIAL_DELAY_MS >= 100, "initial delay should be at least 100ms");
        assert!(
            INITIAL_DELAY_MS <= 5000,
            "initial delay should not exceed 5 seconds"
        );
    }
}
