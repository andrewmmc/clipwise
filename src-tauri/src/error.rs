use thiserror::Error;

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
    /// Create an HTTP error from a status code and body.
    /// Attempts to classify the error into more specific categories.
    pub fn from_http_status(status: u16, body: &str) -> Self {
        match status {
            401 | 403 => AppError::AuthError,
            429 => AppError::RateLimited,
            500 | 502 | 503 | 504 => AppError::NetworkError,
            _ => AppError::Llm(format!("HTTP {}: {}", status, body)),
        }
    }

    /// Returns true if this error should trigger a retry (transient error).
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            AppError::RateLimited | AppError::NetworkError | AppError::Http(_)
        )
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
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
    fn test_from_http_status_classifies_network_errors() {
        assert!(matches!(
            AppError::from_http_status(500, ""),
            AppError::NetworkError
        ));
        assert!(matches!(
            AppError::from_http_status(502, ""),
            AppError::NetworkError
        ));
        assert!(matches!(
            AppError::from_http_status(503, ""),
            AppError::NetworkError
        ));
        assert!(matches!(
            AppError::from_http_status(504, ""),
            AppError::NetworkError
        ));
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
    }

    #[test]
    fn test_is_retryable_returns_false_for_permanent_errors() {
        assert!(!AppError::AuthError.is_retryable());
        assert!(!AppError::Config("test".into()).is_retryable());
        assert!(!AppError::InvalidResponse.is_retryable());
        assert!(!AppError::ActionNotFound("test".into()).is_retryable());
        assert!(!AppError::ProviderNotFound("test".into()).is_retryable());
    }
}
