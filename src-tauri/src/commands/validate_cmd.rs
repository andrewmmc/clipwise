use crate::error::AppError;
use serde_json::{json, Value};

/// Validates that a string is valid JSON with a top-level `result` string field.
/// Returns the extracted result string on success, or an error.
#[tauri::command]
pub fn validate_llm_response(raw: String) -> Result<String, AppError> {
    validate_response_str(&raw)
}

/// Strategy for parsing LLM responses.
/// Each strategy attempts to extract a result string in a different way.
enum ParseStrategy<'a> {
    /// Try parsing the entire input as JSON
    DirectJson(&'a str),
    /// Try extracting JSON from text that has a preamble
    EmbeddedJson(&'a str),
    /// Try treating the input as plain text (after stripping code fences)
    PlainText(&'a str),
}

impl<'a> ParseStrategy<'a> {
    /// Attempt to extract a result string using this strategy.
    fn extract(self) -> Result<String, AppError> {
        match self {
            ParseStrategy::DirectJson(input) => try_parse_json(input),
            ParseStrategy::EmbeddedJson(input) => try_extract_embedded_json(input),
            ParseStrategy::PlainText(input) => Ok(strip_code_fences(input).to_string()),
        }
    }
}

pub fn validate_response_str(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidResponse);
    }

    // Strategy 1: Try direct JSON parsing
    ParseStrategy::DirectJson(trimmed).extract()
}

pub fn normalize_response_str(raw: &str) -> Result<Value, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidResponse);
    }

    // Try each strategy in order until one succeeds
    let result = ParseStrategy::DirectJson(trimmed)
        .extract()
        .or_else(|_| ParseStrategy::EmbeddedJson(trimmed).extract())
        .or_else(|_| ParseStrategy::PlainText(trimmed).extract())?;

    Ok(json!({ "result": result }))
}

/// Attempt to parse input as JSON and extract the result field.
fn try_parse_json(input: &str) -> Result<String, AppError> {
    let parsed: Value = serde_json::from_str(input).map_err(|_| AppError::InvalidResponse)?;
    extract_result_from_value(parsed)
}

/// Attempt to find and parse JSON embedded within text (e.g., "Here's the result: {...}")
fn try_extract_embedded_json(input: &str) -> Result<String, AppError> {
    let json_candidate = extract_json_object(input).ok_or(AppError::InvalidResponse)?;
    try_parse_json(json_candidate)
}

/// Extract the first JSON object from a string (between { and })
fn extract_json_object(raw: &str) -> Option<&str> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    (end >= start).then_some(&raw[start..=end])
}

/// Extract the result string from a parsed JSON value.
fn extract_result_from_value(parsed: Value) -> Result<String, AppError> {
    match parsed {
        Value::Object(map) => map
            .get("result")
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned)
            .ok_or(AppError::InvalidResponse),
        Value::String(result) => Ok(result),
        _ => Err(AppError::InvalidResponse),
    }
}

/// Remove markdown code fences (```json ... ```) from text
fn strip_code_fences(raw: &str) -> &str {
    let stripped = raw.trim();
    if !stripped.starts_with("```") || !stripped.ends_with("```") {
        return stripped;
    }

    let inner = stripped
        .strip_prefix("```")
        .and_then(|s| s.strip_suffix("```"))
        .unwrap_or(stripped)
        .trim();

    // If there's a language identifier (e.g., "json") on the first line, skip it
    if let Some(newline_idx) = inner.find('\n') {
        let first_line = &inner[..newline_idx];
        if !first_line.contains('{') {
            return inner[newline_idx + 1..].trim();
        }
    }

    inner
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

    #[test]
    fn test_unicode_result() {
        let raw = r#"{"result": "こんにちは世界"}"#;
        assert_eq!(validate_response_str(raw).unwrap(), "こんにちは世界");
    }

    #[test]
    fn test_result_with_embedded_newline() {
        let raw = "{\"result\": \"line1\\nline2\"}";
        let result = validate_response_str(raw).unwrap();
        assert!(result.contains('\n'));
    }

    #[test]
    fn test_json_array_at_root_is_rejected() {
        let raw = r#"[{"result": "hello"}]"#;
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_result_null_is_rejected() {
        let raw = r#"{"result": null}"#;
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_result_object_is_rejected() {
        let raw = r#"{"result": {"nested": "value"}}"#;
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_result_array_is_rejected() {
        let raw = r#"{"result": ["a", "b"]}"#;
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_result_boolean_is_rejected() {
        let raw = r#"{"result": true}"#;
        assert!(validate_response_str(raw).is_err());
    }

    #[test]
    fn test_json_string_is_accepted() {
        let raw = r#""plain transformed text""#;
        assert_eq!(
            normalize_response_str(raw).unwrap(),
            json!({ "result": "plain transformed text" })
        );
    }

    #[test]
    fn test_json_with_preamble_is_accepted() {
        let raw = r#"Here you go: {"result":"cleaned up"}"#;
        assert_eq!(
            normalize_response_str(raw).unwrap(),
            json!({ "result": "cleaned up" })
        );
    }

    #[test]
    fn test_plain_text_is_accepted() {
        let raw = "cleaned up";
        assert_eq!(
            normalize_response_str(raw).unwrap(),
            json!({ "result": "cleaned up" })
        );
    }

    #[test]
    fn test_code_fenced_text_is_accepted() {
        let raw = "```json\n{\"result\":\"cleaned up\"}\n```";
        assert_eq!(
            normalize_response_str(raw).unwrap(),
            json!({ "result": "cleaned up" })
        );
    }

    #[test]
    fn test_normalize_response_str_wraps_result() {
        let raw = "plain transformed text";
        assert_eq!(
            normalize_response_str(raw).unwrap(),
            json!({ "result": "plain transformed text" })
        );
    }

    // Tests for strip_code_fences
    #[test]
    fn test_strip_code_fences_removes_json_fence() {
        assert_eq!(
            strip_code_fences("```json\n{\"result\":\"ok\"}\n```"),
            r#"{"result":"ok"}"#
        );
    }

    #[test]
    fn test_strip_code_fences_removes_plain_fence() {
        assert_eq!(
            strip_code_fences("```\n{\"result\":\"ok\"}\n```"),
            r#"{"result":"ok"}"#
        );
    }

    #[test]
    fn test_strip_code_fences_handles_language_identifier() {
        assert_eq!(
            strip_code_fences("```json\n{\"result\":\"ok\"}\n```"),
            r#"{"result":"ok"}"#
        );
    }

    #[test]
    fn test_strip_code_fences_returns_plain_text_if_no_fences() {
        assert_eq!(strip_code_fences("plain text"), "plain text");
    }

    // Tests for extract_json_object
    #[test]
    fn test_extract_json_object_finds_first_brace() {
        assert_eq!(
            extract_json_object("text before {\"result\":\"ok\"} text after"),
            Some(r#"{"result":"ok"}"#)
        );
    }

    #[test]
    fn test_extract_json_object_returns_none_if_no_opening_brace() {
        assert_eq!(extract_json_object("no braces here"), None);
    }

    #[test]
    fn test_extract_json_object_returns_none_if_unclosed() {
        assert_eq!(extract_json_object("{ unclosed brace"), None);
    }
}
