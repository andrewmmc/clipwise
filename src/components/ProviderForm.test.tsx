import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const { default: ProviderForm } = await import("./ProviderForm");
import { mockProvider, mockCliProvider } from "../test/fixtures";

describe("ProviderForm", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
    render(<ProviderForm initial={mockProvider} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Edit Provider")).toBeInTheDocument();
  });

  it("pre-fills name field from initial prop", () => {
    render(<ProviderForm initial={mockProvider} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByDisplayValue("Anthropic Claude")).toBeInTheDocument();
  });

  it("pre-fills default model from initial prop", () => {
    render(<ProviderForm initial={mockProvider} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByDisplayValue("claude-sonnet-4-20250514")).toBeInTheDocument();
  });

  it("shows API fields by default (anthropic type)", () => {
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByPlaceholderText("sk-...")).toBeInTheDocument();
  });

  it("shows CLI fields when initial type is cli", () => {
    render(<ProviderForm initial={mockCliProvider} onSave={onSave} onCancel={onCancel} />);
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
      "My Provider"
    );
    await user.click(screen.getByRole("button", { name: /save provider/i }));
    expect(screen.getByText("API key is required for API providers.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows error when command is missing for CLI type", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.type(
      screen.getByPlaceholderText("e.g. Anthropic Claude"),
      "My CLI"
    );
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    await user.click(screen.getByRole("button", { name: /save provider/i }));
    expect(screen.getByText("Command is required for CLI providers.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // ── Successful submission ─────────────────────────────────────────────────

  it("calls onSave with correct API provider data", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(screen.getByPlaceholderText("e.g. Anthropic Claude"), "Test Provider");
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-ant-key");
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Provider",
          type: "anthropic",
          apiKey: "sk-ant-key",
        })
      )
    );
  });

  it("calls onSave with correct CLI provider data", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);

    await user.type(screen.getByPlaceholderText("e.g. Anthropic Claude"), "My CLI");
    const typeSelect = screen.getByDisplayValue("Anthropic");
    await user.selectOptions(typeSelect, "cli");
    await user.type(screen.getByPlaceholderText("e.g. claude"), "claude");
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My CLI", type: "cli", command: "claude" })
      )
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
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ headers: {} })
      )
    );
  });

  // ── Args (CLI mode) ───────────────────────────────────────────────────────

  it("Add arg button adds an argument row in CLI mode", async () => {
    const user = userEvent.setup();
    render(<ProviderForm initial={mockCliProvider} onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /add arg/i }));
    expect(screen.getAllByPlaceholderText("e.g. --print").length).toBeGreaterThan(1);
  });

  // ── Cancel ────────────────────────────────────────────────────────────────

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
