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
    #[error("Accessibility permission denied — grant access in System Settings > Privacy & Security > Accessibility")]
    AccessibilityPermissionDenied,
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
