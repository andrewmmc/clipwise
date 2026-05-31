import type { ProviderType } from "../types/config";

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  apple: "Apple Intelligence (On-Device)",
  anthropic: "Anthropic",
  openai: "OpenAI-compatible",
  cli: "CLI",
};

export const PROVIDER_OPTION_LABELS: Record<ProviderType, string> = {
  ...PROVIDER_TYPE_LABELS,
  cli: "CLI (claude/codex/copilot)",
};

export const API_PROVIDER_DEFAULT_ENDPOINTS: Record<
  Exclude<ProviderType, "cli" | "apple">,
  string
> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
};

export const API_PROVIDER_DEFAULT_MODELS: Record<
  Exclude<ProviderType, "cli" | "apple">,
  string
> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
};
