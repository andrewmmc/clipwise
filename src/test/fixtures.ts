import type { AppConfig } from "../types/config";

export const mockProvider = {
  id: "p1",
  name: "Anthropic Claude",
  type: "anthropic" as const,
  apiKey: "sk-ant-test",
  defaultModel: "claude-sonnet-4-20250514",
  headers: {},
  args: [],
};

export const mockCliProvider = {
  id: "p2",
  name: "Claude CLI",
  type: "cli" as const,
  command: "claude",
  args: ["--print"],
  headers: {},
};

export const mockAction = {
  id: "a1",
  name: "Refine wording",
  providerId: "p1",
  userPrompt: "Improve clarity and grammar",
};

export const mockActionWithModel = {
  id: "a2",
  name: "Translate to Japanese",
  providerId: "p1",
  userPrompt: "Translate to Japanese",
  model: "claude-3-haiku",
};

export const mockConfig: AppConfig = {
  providers: [mockProvider],
  actions: [mockAction],
  settings: {
    showNotificationOnComplete: true,
    maxTokens: 4096,
  },
};

export const emptyConfig: AppConfig = {
  providers: [],
  actions: [],
  settings: {
    showNotificationOnComplete: true,
    maxTokens: 4096,
  },
};
