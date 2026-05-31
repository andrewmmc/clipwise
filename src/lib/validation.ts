import type {
  Action,
  AppConfig,
  Provider,
  ProviderType,
} from "../types/config";

export const MAX_USER_PROMPT_LENGTH = 2000;

type ApiProviderType = Exclude<ProviderType, "cli" | "apple">;

export function validateEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("https://")) {
    return "Endpoint URL must be a valid https:// URL.";
  }
  try {
    new URL(trimmed);
    return null;
  } catch {
    return "Endpoint URL must be a valid https:// URL.";
  }
}

export function isApiProviderType(type: ProviderType): type is ApiProviderType {
  return type !== "cli" && type !== "apple";
}

export function validateProviderForm(
  data: Pick<Provider, "name" | "type" | "endpoint" | "apiKey" | "command">,
  appleProviderExists: boolean,
) {
  if (!data.name.trim()) {
    return "Provider name is required.";
  }
  if (isApiProviderType(data.type) && !data.apiKey?.trim()) {
    return "API key is required for API providers.";
  }
  if (isApiProviderType(data.type)) {
    const endpointError = validateEndpoint(data.endpoint ?? "");
    if (endpointError) return endpointError;
  }
  if (data.type === "cli" && !data.command?.trim()) {
    return "Command is required for CLI providers.";
  }
  if (data.type === "apple" && appleProviderExists) {
    return "Only one Apple Intelligence provider can be configured.";
  }
  return null;
}

export function validateActionForm(
  data: Pick<Action, "name" | "providerId" | "userPrompt">,
  config: AppConfig,
) {
  if (!data.name.trim() || !data.userPrompt.trim() || !data.providerId) {
    return "Name, provider, and prompt are required.";
  }
  if (!config.providers.some((provider) => provider.id === data.providerId)) {
    return "Selected provider does not exist.";
  }
  if (data.userPrompt.length > MAX_USER_PROMPT_LENGTH) {
    return `User prompt must be ${MAX_USER_PROMPT_LENGTH} characters or fewer.`;
  }
  return null;
}
