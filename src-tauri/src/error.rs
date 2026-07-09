use thiserror::Error;

use crate::retry::is_transient_error;
use serde::ser::SerializeStruct;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Config error: {0}")]
    Config(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Rate limited: too many requests. Please try again later.")]
    RateLimited,
    #[error("Network error: could not reach the server.")]
    NetworkError,
    #[error("Authentication error: invalid API key or credentials.")]
    AuthError,
    #[error("LLM error: {0}")]
    Llm(String),
    #[error("Validation error: response missing 'result' field or not a string")]
    InvalidResponse,
    #[error("Provider not found: {0}")]
    ProviderNotFound(String),
    #[error("Action not found: {0}")]
    ActionNotFound(String),
    #[error("Service error: {0}")]
    Service(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Config(_) => "config",
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
            AppError::Http(_) => "http",
            AppError::RateLimited => "rate_limited",
            AppError::NetworkError => "network",
            AppError::AuthError => "auth",
            AppError::Llm(_) => "llm",
            AppError::InvalidResponse => "invalid_response",
            AppError::ProviderNotFound(_) => "provider_not_found",
            AppError::ActionNotFound(_) => "action_not_found",
            AppError::Service(_) => "service",
        }
    }

    /// Create an HTTP error from a status code and body.
    /// Attempts to classify the error into more specific categories.
    pub fn from_http_status(status: u16, body: &str) -> Self {
        match status {
            401 | 403 => AppError::AuthError,
            429 => AppError::RateLimited,
            code if is_transient_error(code) => AppError::Llm(format!("HTTP {}: {}", status, body)),
            _ => AppError::Llm(format!("HTTP {}: {}", status, body)),
        }
    }

    /// Returns true if this error should trigger a retry (transient error).
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            AppError::RateLimited | AppError::NetworkError | AppError::Http(_)
        ) || matches!(self, AppError::Llm(message) if message.starts_with("HTTP 5"))
    }

    /// Classifies a `reqwest::Error` produced by a failed request.
    ///
    /// Connection- and timeout-level failures (DNS resolution, connection
    /// refused, TLS handshake failure, request timeout) mean the server was
    /// never reached, so they map to the user-friendly `NetworkError`
    /// ("could not reach the server"). Anything else (e.g. a body
    /// encoding/decoding error) falls back to `Http`, which surfaces the
    /// underlying reqwest error message.
    pub fn from_request_error(err: reqwest::Error) -> Self {
        if err.is_connect() || err.is_timeout() {
            AppError::NetworkError
        } else {
            AppError::Http(err)
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_http_status_classifies_auth_errors() {
        assert!(matches!(
            AppError::from_http_status(401, ""),
            AppError::AuthError
        ));
        assert!(matches!(
            AppError::from_http_status(403, ""),
            AppError::AuthError
        ));
    }

    #[test]
    fn test_from_http_status_classifies_rate_limit_errors() {
        assert!(matches!(
            AppError::from_http_status(429, ""),
            AppError::RateLimited
        ));
    }

    #[test]
    fn test_from_http_status_preserves_server_error_body() {
        let error = AppError::from_http_status(500, "Internal Server Error");
        assert!(matches!(error, AppError::Llm(_)));
        assert!(error.to_string().contains("Internal Server Error"));
    }

    #[test]
    fn test_from_http_status_classifies_other_errors_as_llm() {
        let error = AppError::from_http_status(400, "bad request");
        assert!(matches!(error, AppError::Llm(_)));
        if let AppError::Llm(msg) = error {
            assert!(msg.contains("400"));
            assert!(msg.contains("bad request"));
        }
    }

    #[test]
    fn test_is_retryable_returns_true_for_transient_errors() {
        assert!(AppError::RateLimited.is_retryable());
        assert!(AppError::NetworkError.is_retryable());
        assert!(AppError::from_http_status(500, "server error").is_retryable());
    }

    #[test]
    fn test_app_error_serializes_code_and_message() {
        let value = serde_json::to_value(AppError::AuthError).unwrap();
        assert_eq!(value["code"], "auth");
        assert_eq!(
            value["message"],
            "Authentication error: invalid API key or credentials."
        );
    }

    #[test]
    fn test_is_retryable_returns_false_for_permanent_errors() {
        assert!(!AppError::AuthError.is_retryable());
        assert!(!AppError::Config("test".into()).is_retryable());
        assert!(!AppError::InvalidResponse.is_retryable());
        assert!(!AppError::ActionNotFound("test".into()).is_retryable());
        assert!(!AppError::ProviderNotFound("test".into()).is_retryable());
    }

    // -- from_request_error -------------------------------------------------------

    #[tokio::test]
    async fn test_from_request_error_classifies_connection_failure_as_network_error() {
        // Bind to an ephemeral port, then drop the listener so the port is
        // guaranteed to be closed and refuse the connection deterministically.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let client = reqwest::Client::new();
        let err = client
            .get(format!("http://127.0.0.1:{port}"))
            .send()
            .await
            .expect_err("connecting to a closed port should fail");

        assert!(matches!(
            AppError::from_request_error(err),
            AppError::NetworkError
        ));
    }

    #[test]
    fn test_from_request_error_network_error_message_is_user_friendly() {
        assert_eq!(
            AppError::NetworkError.to_string(),
            "Network error: could not reach the server."
        );
    }

    #[test]
    fn test_network_error_is_retryable() {
        assert!(AppError::NetworkError.is_retryable());
    }
}
