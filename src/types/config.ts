export type ProviderType = "openai" | "anthropic" | "cli";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  // API providers
  endpoint?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
  // CLI providers
  command?: string;
  args?: string[];
}

export interface Action {
  id: string;
  name: string;
  providerId: string;
  userPrompt: string;
  model?: string;
}

export interface AppSettings {
  showNotificationOnComplete: boolean;
  maxTokens: number;
}

export interface AppConfig {
  providers: Provider[];
  actions: Action[];
  settings: AppSettings;
}
