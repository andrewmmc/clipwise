use crate::error::AppError;

/// Validates that a string is valid JSON with a top-level `result` string field.
/// Returns the extracted result string on success, or an error.
#[tauri::command]
pub fn validate_llm_response(raw: String) -> Result<String, AppError> {
    validate_response_str(&raw)
}

pub fn validate_response_str(raw: &str) -> Result<String, AppError> {
    let parsed: serde_json::Value =
        serde_json::from_str(raw.trim()).map_err(|_| AppError::InvalidResponse)?;
    let result = parsed
        .get("result")
        .and_then(|v| v.as_str())
        .ok_or(AppError::InvalidResponse)?;
    Ok(result.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_response() {
        let raw = r#"{"result": "Hello, World!"}"#;
        assert_eq!(validate_response_str(raw).unwrap(), "Hello, World!");
    }

    #[test]
    fn test_missing_result_field() {
        let raw = r#"{"text": "Hello"}"#;
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_result_not_string() {
        let raw = r#"{"result": 42}"#;
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_invalid_json() {
        let raw = "not json at all";
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_empty_result() {
        let raw = r#"{"result": ""}"#;
        assert_eq!(validate_response_str(raw).unwrap(), "");
    }

    #[test]
    fn test_result_with_extra_fields() {
        let raw = r#"{"result": "transformed", "extra": "ignored"}"#;
        assert_eq!(validate_response_str(raw).unwrap(), "transformed");
    }

    #[test]
    fn test_whitespace_trimmed() {
        let raw = "  \n{\"result\": \"clean\"}\n  ";
        assert_eq!(validate_response_str(raw).unwrap(), "clean");
    }
}
