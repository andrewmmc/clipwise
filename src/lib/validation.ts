import type {
  Action,
  AppConfig,
  Provider,
  ProviderType,
} from "../types/config";
import type { AppLanguage } from "../types/config";
import { translate } from "./i18n";

export const MAX_USER_PROMPT_LENGTH = 2000;

type ApiProviderType = Exclude<ProviderType, "cli" | "apple">;

export function validateEndpoint(endpoint: string, locale: AppLanguage = "en") {
  const trimmed = endpoint.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("https://")) {
    return translate(locale, "Endpoint URL must be a valid https:// URL.");
  }
  try {
    new URL(trimmed);
    return null;
  } catch {
    return translate(locale, "Endpoint URL must be a valid https:// URL.");
  }
}

export function isApiProviderType(type: ProviderType): type is ApiProviderType {
  return type !== "cli" && type !== "apple";
}

export const PROVIDER_TYPES: ProviderType[] = [
  "apple",
  "anthropic",
  "openai",
  "cli",
];

export function isProviderType(value: string): value is ProviderType {
  return (PROVIDER_TYPES as string[]).includes(value);
}

export function isAppLanguage(value: string): value is AppLanguage {
  return value === "en" || value === "zh-TW";
}

const RESERVED_HEADER_NAMES = new Set(["authorization", "x-api-key"]);

/**
 * `savedHeaderNames` is set when editing: blank values then mean "keep the
 * saved value", so a blank value under a new or renamed header has nothing to
 * keep and must be filled in.
 */
export function validateProviderHeaders(
  headers: [string, string][],
  locale: AppLanguage = "en",
  savedHeaderNames?: string[],
) {
  const seen = new Set<string>();
  for (const [rawName, value] of headers) {
    const name = rawName.trim();
    if (!name) continue;
    if (
      savedHeaderNames &&
      !value.trim() &&
      !savedHeaderNames.includes(rawName)
    ) {
      return translate(locale, "Enter a value for header {{name}}.", {
        name,
      });
    }
    const normalized = name.toLowerCase();
    if (RESERVED_HEADER_NAMES.has(normalized)) {
      return translate(locale, "Header name {{name}} is reserved.", {
        name,
      });
    }
    if (seen.has(normalized)) {
      return translate(
        locale,
        "Duplicate header names are not allowed: {{name}}.",
        {
          name,
        },
      );
    }
    seen.add(normalized);
  }
  return null;
}

export function validateProviderForm(
  data: Pick<Provider, "name" | "type" | "endpoint" | "apiKey" | "command">,
  appleProviderExists: boolean,
  hasStoredApiKey = false,
  locale: AppLanguage = "en",
) {
  if (!data.name.trim()) {
    return translate(locale, "Provider name is required.");
  }
  if (
    isApiProviderType(data.type) &&
    !data.apiKey?.trim() &&
    !hasStoredApiKey
  ) {
    return translate(locale, "API key is required for API providers.");
  }
  if (isApiProviderType(data.type)) {
    const endpointError = validateEndpoint(data.endpoint ?? "", locale);
    if (endpointError) return endpointError;
  }
  if (data.type === "cli" && !data.command?.trim()) {
    return translate(locale, "Command is required for CLI providers.");
  }
  if (data.type === "apple" && appleProviderExists) {
    return translate(
      locale,
      "Only one Apple Intelligence provider can be configured.",
    );
  }
  return null;
}

export function validateActionForm(
  data: Pick<Action, "name" | "providerId" | "userPrompt">,
  config: AppConfig,
  locale: AppLanguage = "en",
) {
  if (!data.name.trim() || !data.userPrompt.trim() || !data.providerId) {
    return translate(locale, "Name, provider, and prompt are required.");
  }
  if (!config.providers.some((provider) => provider.id === data.providerId)) {
    return translate(locale, "Selected provider does not exist.");
  }
  if (data.userPrompt.length > MAX_USER_PROMPT_LENGTH) {
    return translate(
      locale,
      "User prompt must be {{count}} characters or fewer.",
      {
        count: MAX_USER_PROMPT_LENGTH,
      },
    );
  }
  return null;
}
