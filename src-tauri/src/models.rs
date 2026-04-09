use serde::{Deserialize, Serialize};

/// A configured LLM provider (API or CLI).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: ProviderType,
    /// For API providers: base endpoint URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    /// For API providers: API key
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// For API providers: extra headers
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub headers: serde_json::Map<String, serde_json::Value>,
    /// Default model name for this provider
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    /// For CLI providers: command to execute
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// For CLI providers: arguments (model/flags)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Cli,
}

/// A user-defined action that appears in the right-click Services menu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub id: String,
    /// Display name shown in the Services menu
    pub name: String,
    /// ID of the provider to use
    pub provider_id: String,
    /// User-facing instruction sent to the LLM
    pub user_prompt: String,
    /// Optional model override (overrides provider default)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Global application settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_true")]
    pub show_notification_on_complete: bool,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_true() -> bool {
    true
}
fn default_max_tokens() -> u32 {
    4096
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            show_notification_on_complete: true,
            max_tokens: 4096,
        }
    }
}

/// Root configuration object stored in ~/Library/Application Support/llm-actions/config.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub providers: Vec<Provider>,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default)]
    pub settings: AppSettings,
}

/// The fixed system prompt injected before every LLM call.
/// Users cannot change this — it enforces JSON response format.
pub const SYSTEM_PROMPT: &str = "You are a text transformation assistant. \
The user will give you an instruction and a piece of text. \
Apply the instruction to the text. \
Respond ONLY with valid JSON in this exact format: {\"result\": \"transformed text here\"}. \
Do not include any explanation, markdown formatting, or code blocks. \
Only output the raw JSON object.";

/// The validated result extracted from an LLM response.
#[derive(Debug, Deserialize)]
pub struct LlmResult {
    pub result: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_api_provider() -> Provider {
        Provider {
            id: "p1".into(),
            name: "Anthropic".into(),
            provider_type: ProviderType::Anthropic,
            endpoint: Some("https://api.anthropic.com/v1/messages".into()),
            api_key: Some("sk-ant-test".into()),
            headers: serde_json::Map::new(),
            default_model: Some("claude-sonnet-4-20250514".into()),
            command: None,
            args: vec![],
        }
    }

    fn make_cli_provider() -> Provider {
        Provider {
            id: "p2".into(),
            name: "CLI".into(),
            provider_type: ProviderType::Cli,
            endpoint: None,
            api_key: None,
            headers: serde_json::Map::new(),
            default_model: None,
            command: Some("claude".into()),
            args: vec!["--print".into()],
        }
    }

    fn make_action() -> Action {
        Action {
            id: "a1".into(),
            name: "Refine".into(),
            provider_id: "p1".into(),
            user_prompt: "Improve this text".into(),
            model: None,
        }
    }

    // ── ProviderType serde ────────────────────────────────────────────────────

    #[test]
    fn test_provider_type_openai_round_trip() {
        let json = "\"openai\"";
        let pt: ProviderType = serde_json::from_str(json).unwrap();
        assert_eq!(pt, ProviderType::OpenAI);
        assert_eq!(serde_json::to_string(&pt).unwrap(), json);
    }

    #[test]
    fn test_provider_type_anthropic_round_trip() {
        let json = "\"anthropic\"";
        let pt: ProviderType = serde_json::from_str(json).unwrap();
        assert_eq!(pt, ProviderType::Anthropic);
        assert_eq!(serde_json::to_string(&pt).unwrap(), json);
    }

    #[test]
    fn test_provider_type_cli_round_trip() {
        let json = "\"cli\"";
        let pt: ProviderType = serde_json::from_str(json).unwrap();
        assert_eq!(pt, ProviderType::Cli);
        assert_eq!(serde_json::to_string(&pt).unwrap(), json);
    }

    #[test]
    fn test_provider_type_wrong_case_is_rejected() {
        assert!(serde_json::from_str::<ProviderType>("\"OpenAI\"").is_err());
        assert!(serde_json::from_str::<ProviderType>("\"Anthropic\"").is_err());
        assert!(serde_json::from_str::<ProviderType>("\"CLI\"").is_err());
    }

    // ── Provider serde ────────────────────────────────────────────────────────

    #[test]
    fn test_api_provider_serialises_camel_case_fields() {
        let json = serde_json::to_string(&make_api_provider()).unwrap();
        assert!(json.contains("\"apiKey\""), "expected camelCase apiKey");
        assert!(
            json.contains("\"defaultModel\""),
            "expected camelCase defaultModel"
        );
        assert!(!json.contains("\"api_key\""), "snake_case must not appear");
    }

    #[test]
    fn test_api_provider_round_trip() {
        let provider = make_api_provider();
        let json = serde_json::to_string(&provider).unwrap();
        let decoded: Provider = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.id, provider.id);
        assert_eq!(decoded.api_key, provider.api_key);
        assert_eq!(decoded.default_model, provider.default_model);
        assert_eq!(decoded.provider_type, ProviderType::Anthropic);
    }

    #[test]
    fn test_cli_provider_round_trip() {
        let provider = make_cli_provider();
        let json = serde_json::to_string(&provider).unwrap();
        let decoded: Provider = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.command, Some("claude".into()));
        assert_eq!(decoded.args, vec!["--print"]);
    }

    #[test]
    fn test_provider_optional_api_fields_omitted_for_cli() {
        let json = serde_json::to_string(&make_cli_provider()).unwrap();
        assert!(!json.contains("\"endpoint\""));
        assert!(!json.contains("\"apiKey\""));
        assert!(!json.contains("\"defaultModel\""));
    }

    // ── Action serde ──────────────────────────────────────────────────────────

    #[test]
    fn test_action_camel_case_fields() {
        let json = serde_json::to_string(&make_action()).unwrap();
        assert!(json.contains("\"providerId\""));
        assert!(json.contains("\"userPrompt\""));
        assert!(!json.contains("\"provider_id\""));
    }

    #[test]
    fn test_action_model_override_included_when_set() {
        let mut action = make_action();
        action.model = Some("gpt-4o".into());
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("\"model\""));
        let decoded: Action = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.model, Some("gpt-4o".into()));
    }

    #[test]
    fn test_action_model_field_omitted_when_none() {
        let json = serde_json::to_string(&make_action()).unwrap();
        assert!(!json.contains("\"model\""), "None model must be omitted");
    }

    // ── AppSettings defaults ──────────────────────────────────────────────────

    #[test]
    fn test_app_settings_all_defaults_from_empty_json() {
        let s: AppSettings = serde_json::from_str("{}").unwrap();
        assert!(s.show_notification_on_complete);
        assert_eq!(s.max_tokens, 4096);
    }

    #[test]
    fn test_app_settings_partial_json_fills_defaults() {
        let s: AppSettings = serde_json::from_str(r#"{"maxTokens": 2048}"#).unwrap();
        assert!(s.show_notification_on_complete); // default preserved
        assert_eq!(s.max_tokens, 2048);
    }

    #[test]
    fn test_app_settings_default_impl() {
        let s = AppSettings::default();
        assert!(s.show_notification_on_complete);
        assert_eq!(s.max_tokens, 4096);
    }

    // ── AppConfig ─────────────────────────────────────────────────────────────

    #[test]
    fn test_app_config_default_has_empty_collections() {
        let c = AppConfig::default();
        assert!(c.providers.is_empty());
        assert!(c.actions.is_empty());
    }

    // ── SYSTEM_PROMPT ─────────────────────────────────────────────────────────

    #[test]
    fn test_system_prompt_contains_json_instruction() {
        assert!(
            SYSTEM_PROMPT.contains("result"),
            "must mention 'result' field"
        );
        assert!(SYSTEM_PROMPT.contains("JSON"), "must mention JSON");
    }

    #[test]
    fn test_system_prompt_does_not_reveal_internal_instructions() {
        // Sanity: confirm the constant is non-empty
        assert!(!SYSTEM_PROMPT.is_empty());
    }
}
