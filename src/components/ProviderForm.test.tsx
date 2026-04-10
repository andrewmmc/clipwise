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
    const hint = screen.getByText(/find the installed binary path with/i);
    expect(hint).toBeInTheDocument();
    expect(screen.getByText("where claude")).toBeInTheDocument();
    expect(screen.getByText("where codex")).toBeInTheDocument();
    expect(screen.getByText("where copilot")).toBeInTheDocument();
    expect(screen.getByText("where claude")).toHaveClass("bg-gray-100");
    expect(hint).not.toHaveClass("bg-gray-50");
  });

  it("shows a headless mode hint for CLI arguments", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    expect(
      screen.getByText(/configure the cli to run in headless mode/i),
    ).toBeInTheDocument();
    expect(screen.getByText("-p")).toBeInTheDocument();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("shows error when name is empty on submit", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /save provider/i }));
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
    await user.click(screen.getByRole("button", { name: /save provider/i }));
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
    await user.click(screen.getByRole("button", { name: /save provider/i }));
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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    expect(
      screen.getByText("Endpoint URL must be a valid https:// URL."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole("button", { name: /test command/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("test_cli_command", {
        command: "/bin/sh",
      }),
    );
    expect(screen.getByText("Command looks good: /bin/sh")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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

  it("shows an inline error when testing an empty CLI command", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.selectOptions(screen.getByDisplayValue("Anthropic"), "cli");
    await user.click(screen.getByRole("button", { name: /test command/i }));

    expect(
      screen.getByText("Enter a command before testing."),
    ).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { "X-Empty-Value": "" },
        }),
      ),
    );
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

    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: undefined,
        }),
      ),
    );
  });

  it("whitespace-only name is treated as empty", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "   ",
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-key");
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ["--print"], // Original arg, empty arg filtered
        }),
      ),
    );
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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [], // Empty args should be filtered out
        }),
      ),
    );
  });
});
