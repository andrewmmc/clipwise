import { describe, it, expect } from "vitest";
import {
  MAX_USER_PROMPT_LENGTH,
  isApiProviderType,
  validateActionForm,
  validateEndpoint,
  validateProviderForm,
} from "./validation";
import type { AppConfig, Provider } from "../types/config";

const baseConfig: AppConfig = {
  providers: [
    {
      id: "p1",
      name: "OpenAI",
      type: "openai",
      headers: {},
      args: [],
    } as Provider,
  ],
  actions: [],
  settings: {
    showNotificationOnComplete: true,
    maxTokens: 1000,
    historyEnabled: true,
  },
};

describe("validateEndpoint", () => {
  it("allows an empty endpoint", () => {
    expect(validateEndpoint("")).toBeNull();
    expect(validateEndpoint("   ")).toBeNull();
  });

  it("rejects a non-https endpoint", () => {
    expect(validateEndpoint("http://example.com")).toMatch(/https/);
  });

  it("rejects a malformed https endpoint", () => {
    expect(validateEndpoint("https://")).toMatch(/https/);
  });

  it("accepts a valid https endpoint", () => {
    expect(validateEndpoint("https://api.example.com/v1")).toBeNull();
  });
});

describe("isApiProviderType", () => {
  it("treats openai and anthropic as API types", () => {
    expect(isApiProviderType("openai")).toBe(true);
    expect(isApiProviderType("anthropic")).toBe(true);
  });

  it("treats cli and apple as non-API types", () => {
    expect(isApiProviderType("cli")).toBe(false);
    expect(isApiProviderType("apple")).toBe(false);
  });
});

describe("validateProviderForm", () => {
  it("requires a name", () => {
    expect(
      validateProviderForm({ name: "   ", type: "openai", apiKey: "k" }, false),
    ).toMatch(/name is required/i);
  });

  it("requires an API key for API providers", () => {
    expect(
      validateProviderForm({ name: "OpenAI", type: "openai" }, false),
    ).toMatch(/API key is required/i);
  });

  it("requires an API key when apiKey is only whitespace", () => {
    expect(
      validateProviderForm(
        { name: "OpenAI", type: "openai", apiKey: "  " },
        false,
      ),
    ).toMatch(/API key is required/i);
  });

  it("rejects an invalid endpoint for API providers", () => {
    expect(
      validateProviderForm(
        {
          name: "OpenAI",
          type: "openai",
          apiKey: "k",
          endpoint: "http://insecure.example.com",
        },
        false,
      ),
    ).toMatch(/https/);
  });

  it("defaults a missing endpoint to empty and passes", () => {
    expect(
      validateProviderForm(
        { name: "OpenAI", type: "openai", apiKey: "k" },
        false,
      ),
    ).toBeNull();
  });

  it("requires a command for CLI providers", () => {
    expect(
      validateProviderForm({ name: "My CLI", type: "cli" }, false),
    ).toMatch(/Command is required/i);
  });

  it("accepts a valid CLI provider", () => {
    expect(
      validateProviderForm(
        { name: "My CLI", type: "cli", command: "llm" },
        false,
      ),
    ).toBeNull();
  });

  it("allows only one Apple provider", () => {
    expect(
      validateProviderForm({ name: "Apple", type: "apple" }, true),
    ).toMatch(/Only one Apple/i);
  });

  it("accepts an Apple provider when none exists yet", () => {
    expect(
      validateProviderForm({ name: "Apple", type: "apple" }, false),
    ).toBeNull();
  });
});

describe("validateActionForm", () => {
  it("requires name, provider, and prompt", () => {
    expect(
      validateActionForm(
        { name: "", providerId: "p1", userPrompt: "do it" },
        baseConfig,
      ),
    ).toMatch(/required/i);
  });

  it("rejects a provider that does not exist", () => {
    expect(
      validateActionForm(
        { name: "Act", providerId: "missing", userPrompt: "do it" },
        baseConfig,
      ),
    ).toMatch(/does not exist/i);
  });

  it("rejects a prompt exceeding the max length", () => {
    expect(
      validateActionForm(
        {
          name: "Act",
          providerId: "p1",
          userPrompt: "a".repeat(MAX_USER_PROMPT_LENGTH + 1),
        },
        baseConfig,
      ),
    ).toMatch(new RegExp(`${MAX_USER_PROMPT_LENGTH} characters`));
  });

  it("accepts a valid action", () => {
    expect(
      validateActionForm(
        { name: "Act", providerId: "p1", userPrompt: "do it" },
        baseConfig,
      ),
    ).toBeNull();
  });
});
