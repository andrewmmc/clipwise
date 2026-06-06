import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const { default: ProviderForm } = await import("./ProviderForm");
import { mockProvider, mockCliProvider } from "../test/fixtures";

describe("ProviderForm", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(async (command) => {
      if (command === "check_apple_model_availability") {
        return { available: true, reason: null };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });
    onSave.mockReset();
    onCancel.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it("shows 'New Provider' heading in create mode", () => {
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("New Provider")).toBeInTheDocument();
  });

  it("shows 'Edit Provider' heading in edit mode", () => {
    render(
      <ProviderForm
        initial={mockProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Edit Provider")).toBeInTheDocument();
  });

  it("pre-fills name field from initial prop", () => {
    render(
      <ProviderForm
        initial={mockProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByDisplayValue("Anthropic Claude")).toBeInTheDocument();
  });

  it("pre-fills default model from initial prop", () => {
    render(
      <ProviderForm
        initial={mockProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.getByDisplayValue("claude-sonnet-4-20250514"),
    ).toBeInTheDocument();
  });

  it("shows API fields by default (anthropic type)", () => {
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByPlaceholderText("sk-...")).toBeInTheDocument();
  });

  it("shows Apple Intelligence as a provider type option", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "apple");

    expect(
      screen.getByDisplayValue("Apple Intelligence (On-Device)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/uses apple's on-device foundation model/i),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("sk-...")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("e.g. claude"),
    ).not.toBeInTheDocument();
  });

  it("disables Apple Intelligence when availability check says it is unsupported", async () => {
    mockInvoke.mockImplementation(async (command) => {
      if (command === "check_apple_model_availability") {
        return { available: false, reason: "not_supported" };
      }
      return undefined;
    });

    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    const option = await screen.findByRole("option", {
      name: "Apple Intelligence (On-Device)",
    });

    expect(option).toBeDisabled();
    expect(
      screen.getByText("Apple Intelligence is not supported on this Mac."),
    ).toBeInTheDocument();
  });

  it("shows not enabled and not ready Apple availability messages", async () => {
    mockInvoke.mockImplementation(async (command) => {
      if (command === "check_apple_model_availability") {
        return { available: false, reason: "not_enabled" };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });

    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    expect(
      await screen.findByText(/not enabled in system settings/i),
    ).toBeInTheDocument();

    cleanup();
    mockInvoke.mockImplementation(async (command) => {
      if (command === "check_apple_model_availability") {
        return { available: false, reason: "not_ready" };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });

    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    expect(
      await screen.findByText(/still preparing its on-device model/i),
    ).toBeInTheDocument();
  });

  it("falls back when Apple and CLI checks fail", async () => {
    mockInvoke.mockRejectedValue(new Error("unavailable"));

    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    expect(
      await screen.findByText(/currently unavailable on this mac/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "CLI (claude/codex/copilot)" }),
    ).not.toBeInTheDocument();
  });

  it("disables Apple Intelligence when another Apple provider already exists", async () => {
    render(
      <ProviderForm
        existingProviders={[
          {
            id: "apple-intelligence",
            name: "Apple Intelligence",
            type: "apple",
            headers: {},
            args: [],
          },
        ]}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const option = await screen.findByRole("option", {
      name: "Apple Intelligence (On-Device)",
    });

    expect(option).toBeDisabled();
    expect(
      screen.getByText(
        "Only one Apple Intelligence provider can be configured.",
      ),
    ).toBeInTheDocument();
  });

  it("shows CLI fields when initial type is cli", () => {
    render(
      <ProviderForm
        initial={mockCliProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByDisplayValue("claude")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("sk-...")).not.toBeInTheDocument();
  });

  it("switching type to cli hides API fields and shows CLI fields", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    expect(screen.queryByPlaceholderText("sk-...")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. claude")).toBeInTheDocument();
  });

  it("defaults new CLI providers to a -p argument", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    expect(screen.getByDisplayValue("-p")).toBeInTheDocument();
  });

  it("shows a command path hint in CLI mode", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    const hint = screen.getByText(/find the binary path with/i);
    expect(hint).toBeInTheDocument();
    expect(screen.getByText("which claude")).toBeInTheDocument();
  });

  it("shows a headless mode hint for CLI arguments", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    expect(screen.getByText(/configure headless mode/i)).toBeInTheDocument();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("shows error when name is empty on submit", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(screen.getByText("Provider name is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows error when API key is missing for anthropic type", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(
      screen.getByText("API key is required for API providers."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows error when command is missing for CLI type", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My CLI",
    );
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(
      screen.getByText("Command is required for CLI providers."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows error when endpoint is not a valid https url", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(
      screen.getByPlaceholderText(/https:\/\//i),
      "http://api.example.com",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-ant-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getByText("Endpoint URL must be a valid https:// URL."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("tests an API provider connection before saving", async () => {
    mockInvoke.mockImplementation(async (command) => {
      if (command === "test_provider") {
        return "Connection successful. Provider responded: ok";
      }
      if (command === "check_apple_model_availability") {
        return { available: true, reason: null };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-ant-key");
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "test_provider",
        expect.objectContaining({
          provider: expect.objectContaining({
            name: "My Provider",
            type: "anthropic",
            apiKey: "sk-ant-key",
          }),
        }),
      ),
    );
    expect(
      screen.getByText("Connection successful. Provider responded: ok"),
    ).toBeInTheDocument();
  });

  it("shows an inline error when testing an API provider connection fails", async () => {
    mockInvoke.mockImplementation(async (command) => {
      if (command === "test_provider") {
        throw new Error("invalid api key");
      }
      if (command === "check_apple_model_availability") {
        return { available: true, reason: null };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "bad-key");
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() =>
      expect(screen.getByText("invalid api key")).toBeInTheDocument(),
    );
  });

  it("tests a CLI command before saving", async () => {
    mockInvoke.mockResolvedValue("Command looks good: /bin/sh");
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My CLI",
    );
    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");
    await user.type(screen.getByPlaceholderText("e.g. claude"), "/bin/sh");
    await user.click(screen.getByRole("button", { name: /^test$/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("test_cli_command", {
        command: "/bin/sh",
      }),
    );
    expect(screen.getByText("Command looks good: /bin/sh")).toBeInTheDocument();
  });

  it("shows an inline error when testing a CLI command fails", async () => {
    mockInvoke.mockImplementation(async (command) => {
      if (command === "test_cli_command") {
        throw new Error("command failed");
      }
      if (command === "check_apple_model_availability") {
        return { available: true, reason: null };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");
    await user.type(screen.getByPlaceholderText("e.g. claude"), "bad-cli");
    await user.click(screen.getByRole("button", { name: /^test$/i }));

    await waitFor(() =>
      expect(screen.getByText("command failed")).toBeInTheDocument(),
    );
  });

  it("shows non-Error CLI test failures", async () => {
    mockInvoke.mockImplementation(async (command) => {
      if (command === "test_cli_command") {
        throw "command failed";
      }
      if (command === "check_apple_model_availability") {
        return { available: true, reason: null };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");
    await user.type(screen.getByPlaceholderText("e.g. claude"), "bad-cli");
    await user.click(screen.getByRole("button", { name: /^test$/i }));

    await waitFor(() =>
      expect(screen.getByText("command failed")).toBeInTheDocument(),
    );
  });

  // ── Successful submission ─────────────────────────────────────────────────

  it("calls onSave with correct API provider data", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "Test Provider",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-ant-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Provider",
          type: "anthropic",
          apiKey: "sk-ant-key",
        }),
      ),
    );
  });

  it("calls onSave with correct CLI provider data", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My CLI",
    );
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    await user.type(screen.getByPlaceholderText("e.g. claude"), "claude");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My CLI",
          type: "cli",
          command: "claude",
          args: ["-p"],
        }),
      ),
    );
  });

  it("calls onSave with correct Apple provider data", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "Apple Local",
    );
    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "apple");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Apple Local",
          type: "apple",
          endpoint: undefined,
          apiKey: undefined,
          headers: {},
          args: [],
        }),
      ),
    );
  });

  it("shows onSave errors", async () => {
    onSave.mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "Test Provider",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-ant-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText("save failed")).toBeInTheDocument(),
    );
  });

  it("prevents saving a duplicate Apple provider", async () => {
    const user = userEvent.setup();
    render(
      <ProviderForm
        initial={{
          id: "apple-duplicate",
          name: "Second Apple",
          type: "apple",
          headers: {},
          args: [],
        }}
        existingProviders={[
          {
            id: "apple-intelligence",
            name: "Apple Intelligence",
            type: "apple",
            headers: {},
            args: [],
          },
        ]}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getAllByText(
        "Only one Apple Intelligence provider can be configured.",
      ).length,
    ).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows Apple unavailable message for an existing Apple provider", async () => {
    mockInvoke.mockImplementation(async (command) => {
      if (command === "check_apple_model_availability") {
        return { available: false, reason: "not_supported" };
      }
      if (command === "is_cli_provider_enabled") {
        return true;
      }
      return undefined;
    });

    render(
      <ProviderForm
        initial={{
          id: "apple-intelligence",
          name: "Apple Intelligence",
          type: "apple",
          headers: {},
          args: [],
        }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getAllByText("Apple Intelligence is not supported on this Mac."),
      ).toHaveLength(2),
    );
  });

  it("shows an inline error when testing an empty CLI command", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");
    await user.click(screen.getByRole("button", { name: /^test$/i }));

    expect(
      screen.getByText("Enter a command before testing."),
    ).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "test_cli_command",
      expect.anything(),
    );
  });

  // ── Headers ───────────────────────────────────────────────────────────────

  it("Add header button adds a header row", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /add header/i }));
    expect(screen.getAllByPlaceholderText("Header name").length).toBe(1);
  });

  it("headers with empty key are excluded from payload", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    // Add a header row but leave key blank
    await user.click(screen.getByRole("button", { name: /add header/i }));
    await user.type(screen.getByPlaceholderText("Value"), "some-value");

    await user.type(screen.getByPlaceholderText("e.g. Anthropic Claude"), "P");
    await user.type(screen.getByPlaceholderText("sk-..."), "k");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ headers: {} }),
      ),
    );
  });

  // ── Args (CLI mode) ───────────────────────────────────────────────────────

  it("Add arg button adds an argument row in CLI mode", async () => {
    const user = userEvent.setup();
    render(
      <ProviderForm
        initial={mockCliProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add arg/i }));
    expect(
      screen.getAllByPlaceholderText("e.g. --print").length,
    ).toBeGreaterThan(1);
  });

  // ── Cancel ────────────────────────────────────────────────────────────────

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // ── Type switching (CLI ↔ API) ───────────────────────────────────────────────

  it("switching from API to CLI preserves form state", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    // Fill API fields
    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-test-key");
    await user.type(
      screen.getByPlaceholderText(/https:\/\//i),
      "https://custom.api.com",
    );

    // Switch to CLI
    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");

    // Switch back to API - state should be preserved
    await user.selectOptions(
      screen.getByDisplayValue("CLI (claude/codex/copilot)"),
      "anthropic",
    );

    expect(screen.getByDisplayValue("My Provider")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sk-test-key")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://custom.api.com"),
    ).toBeInTheDocument();
  });

  it("switching from CLI to API clears CLI validation errors", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    // Switch to CLI and trigger validation error
    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");
    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My CLI",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getByText("Command is required for CLI providers."),
    ).toBeInTheDocument();

    // Switch back to API - error should clear
    await user.selectOptions(
      screen.getByDisplayValue("CLI (claude/codex/copilot)"),
      "anthropic",
    );

    expect(
      screen.queryByText("Command is required for CLI providers."),
    ).not.toBeInTheDocument();
  });

  it("switching to OpenAI type shows correct endpoint placeholder", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "openai");

    const endpointInput = screen.getByPlaceholderText(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(endpointInput).toBeInTheDocument();
  });

  it("switching to anthropic type shows correct endpoint placeholder", async () => {
    const user = userEvent.setup();
    render(
      <ProviderForm
        initial={mockCliProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // First switch to API (should default to anthropic)
    await user.selectOptions(
      screen.getByDisplayValue("CLI (claude/codex/copilot)"),
      "anthropic",
    );

    const endpointInput = screen.getByPlaceholderText(
      "https://api.anthropic.com/v1/messages",
    );
    expect(endpointInput).toBeInTheDocument();
  });

  // ── Custom headers edge cases ─────────────────────────────────────────────────

  it("provider with no headers saves with empty headers object", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();

    // Start with a provider that has no headers
    render(
      <ProviderForm
        initial={mockProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Don't add any headers, just save
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ headers: {} }),
      ),
    );
  });

  it("header value can be empty while key is present", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /add header/i }));

    // Fill key but leave value empty
    const keyInput = screen.getByPlaceholderText("Header name");
    await user.type(keyInput, "X-Empty-Value");

    await user.type(screen.getByPlaceholderText("e.g. Anthropic Claude"), "P");
    await user.type(screen.getByPlaceholderText("sk-..."), "k");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { "X-Empty-Value": "" },
        }),
      ),
    );
  });

  it("default model is included when filled", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(screen.getByPlaceholderText("e.g. Anthropic Claude"), "P");
    await user.type(screen.getByPlaceholderText("sk-..."), "k");
    await user.type(
      screen.getByPlaceholderText("claude-sonnet-4-20250514"),
      "claude-opus",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ defaultModel: "claude-opus" }),
      ),
    );
  });

  it("removes custom headers", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /add header/i }));
    expect(screen.getByPlaceholderText("Header name")).toBeInTheDocument();
    await user.click(document.querySelector(".btn-icon-danger")!);

    expect(
      screen.queryByPlaceholderText("Header name"),
    ).not.toBeInTheDocument();
  });

  it("multiple headers with special characters are preserved", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();

    const providerWithSpecialHeaders = {
      ...mockProvider,
      headers: {
        "X-API-Key": "key-with-123",
        "X-Request-ID": "req_abc-123_xyz",
      },
    };

    render(
      <ProviderForm
        initial={providerWithSpecialHeaders}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            "X-API-Key": "key-with-123",
            "X-Request-ID": "req_abc-123_xyz",
          },
        }),
      ),
    );
  });

  it("updates the second custom header", async () => {
    const user = userEvent.setup();
    const providerWithHeaders = {
      ...mockProvider,
      headers: { One: "1", Two: "2" },
    };

    render(
      <ProviderForm
        initial={providerWithHeaders}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const values = screen.getAllByPlaceholderText("Value");
    await user.clear(values[1]);
    await user.type(values[1], "updated");

    expect(screen.getByDisplayValue("updated")).toBeInTheDocument();
  });

  // ── Validation edge cases ────────────────────────────────────────────────────

  it("endpoint with invalid URL format shows error", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(
      screen.getByPlaceholderText(/https:\/\//i),
      "not-a-valid-url",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getByText("Endpoint URL must be a valid https:// URL."),
    ).toBeInTheDocument();
  });

  it("endpoint with http:// (not https) shows error", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(
      screen.getByPlaceholderText(/https:\/\//i),
      "http://insecure.com",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getByText("Endpoint URL must be a valid https:// URL."),
    ).toBeInTheDocument();
  });

  it("empty endpoint is allowed (uses default)", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-key");
    // Leave endpoint empty
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: undefined,
        }),
      ),
    );
  });

  it("malformed https endpoint shows error", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(screen.getByPlaceholderText(/https:\/\//i), "https://");
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getByText("Endpoint URL must be a valid https:// URL."),
    ).toBeInTheDocument();
  });

  it("whitespace-only name is treated as empty", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "   ",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(screen.getByText("Provider name is required.")).toBeInTheDocument();
  });

  it("whitespace-only API key is treated as empty", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My Provider",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "   ");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getByText("API key is required for API providers."),
    ).toBeInTheDocument();
  });

  it("whitespace-only CLI command is treated as empty", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My CLI",
    );
    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");
    await user.type(screen.getByPlaceholderText("e.g. claude"), "   ");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      screen.getByText("Command is required for CLI providers."),
    ).toBeInTheDocument();
  });

  // ── Reset button ─────────────────────────────────────────────────────────────

  it("reset button restores initial values", async () => {
    const user = userEvent.setup();
    render(
      <ProviderForm
        initial={mockProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Modify fields
    const nameInput = screen.getByDisplayValue("Anthropic Claude");
    await user.clear(nameInput);
    await user.type(nameInput, "Modified Name");

    const keyInput = screen.getByPlaceholderText("sk-...");
    await user.clear(keyInput);
    await user.type(keyInput, "modified-key");

    // Click reset
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.getByDisplayValue("Anthropic Claude")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sk-ant-test")).toBeInTheDocument();
  });

  it("reset button in create mode clears all fields", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    // Fill fields
    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "Test",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "key");

    // Click reset
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.queryByDisplayValue("Test")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("key")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Anthropic")).toBeInTheDocument(); // Type default
  });

  it("reset button restores CLI provider without args", async () => {
    const user = userEvent.setup();
    const cliProviderNoArgs = { ...mockCliProvider, args: undefined };

    render(
      <ProviderForm
        initial={cliProviderNoArgs}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add arg/i }));
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(
      screen.getByText("No arguments. Common: --print -m sonnet"),
    ).toBeInTheDocument();
  });

  // ── Args edge cases ──────────────────────────────────────────────────────────

  it("empty args are filtered out on submit", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ProviderForm
        initial={mockCliProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Add empty arg
    await user.click(screen.getByRole("button", { name: /add arg/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ["--print"], // Original arg, empty arg filtered
        }),
      ),
    );
  });

  it("updates and removes CLI args", async () => {
    const user = userEvent.setup();

    render(
      <ProviderForm
        initial={mockCliProvider}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const argInput = screen.getByDisplayValue("--print");
    await user.clear(argInput);
    await user.type(argInput, "--json");
    expect(screen.getByDisplayValue("--json")).toBeInTheDocument();

    await user.click(document.querySelector(".btn-icon-danger")!);
    expect(
      screen.getByText("No arguments. Common: --print -m sonnet"),
    ).toBeInTheDocument();
  });

  it("updates the second CLI arg", async () => {
    const user = userEvent.setup();
    render(
      <ProviderForm
        initial={{ ...mockCliProvider, args: ["--print", "--model"] }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const argInputs = screen.getAllByPlaceholderText("e.g. --print");
    await user.clear(argInputs[1]);
    await user.type(argInputs[1], "sonnet");

    expect(screen.getByDisplayValue("sonnet")).toBeInTheDocument();
  });

  it("all empty args results in empty array", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();

    // Start with a CLI provider that has no args
    const cliProviderNoArgs = { ...mockCliProvider, args: [] };

    render(
      <ProviderForm
        initial={cliProviderNoArgs}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Add empty args (they will be filtered out on submit)
    await user.click(screen.getByRole("button", { name: /add arg/i }));
    await user.click(screen.getByRole("button", { name: /add arg/i }));

    // Fill required fields for CLI (name is already set from mockCliProvider)
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [], // Empty args should be filtered out
        }),
      ),
    );
  });
});
