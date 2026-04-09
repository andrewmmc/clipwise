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
