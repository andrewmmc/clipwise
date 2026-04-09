import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const { default: ProviderList } = await import("./ProviderList");
import { mockConfig, emptyConfig, mockProvider } from "../test/fixtures";

describe("ProviderList", () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onRefresh.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("shows empty state when no providers are configured", () => {
    render(<ProviderList config={emptyConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("No providers configured.")).toBeInTheDocument();
  });

  // ── List view ─────────────────────────────────────────────────────────────

  it("renders the provider name", () => {
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("Anthropic Claude")).toBeInTheDocument();
  });

  it("renders the human-readable type label for anthropic", () => {
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText(/Anthropic · claude-sonnet/)).toBeInTheDocument();
  });

  it("renders the default model when present", () => {
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText(/claude-sonnet-4-20250514/)).toBeInTheDocument();
  });

  it("renders the endpoint when present", () => {
    const config = {
      ...mockConfig,
      providers: [{ ...mockProvider, endpoint: "https://api.example.com" }],
    };
    render(<ProviderList config={config} onRefresh={onRefresh} />);
    expect(screen.getByText("https://api.example.com")).toBeInTheDocument();
  });

  it("renders the CLI command for cli-type providers", () => {
    const config = {
      ...mockConfig,
      providers: [
        {
          id: "p2",
          name: "Claude CLI",
          type: "cli" as const,
          command: "claude",
          args: ["--print"],
          headers: {},
        },
      ],
    };
    render(<ProviderList config={config} onRefresh={onRefresh} />);
    expect(screen.getByText(/claude/)).toBeInTheDocument();
  });

  it("renders the section heading and description", () => {
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(
      screen.getByText("Configure LLM API or CLI providers.")
    ).toBeInTheDocument();
  });

  // ── Create provider ───────────────────────────────────────────────────────

  it("clicking Add Provider shows the ProviderForm", async () => {
    const user = userEvent.setup();
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /add provider/i }));
    expect(screen.getByText("New Provider")).toBeInTheDocument();
  });

  it("submitting ProviderForm calls addProvider and onRefresh", async () => {
    mockInvoke.mockResolvedValue({ ...mockProvider, id: "new-id" });
    const user = userEvent.setup();
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);

    await user.click(screen.getByRole("button", { name: /add provider/i }));
    await user.type(screen.getByPlaceholderText("e.g. Anthropic Claude"), "New Provider");
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-test");
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("add_provider", expect.anything())
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  // ── Delete provider ───────────────────────────────────────────────────────

  it("shows alert and blocks deletion when actions use the provider", async () => {
    // mockConfig has action a1 using provider p1
    const user = userEvent.setup();
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByTitle("Delete"));
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("action(s) use this provider")
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("confirmed deletion calls deleteProvider and onRefresh when no actions use provider", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const config = { ...mockConfig, actions: [] }; // no actions referencing the provider
    const user = userEvent.setup();
    render(<ProviderList config={config} onRefresh={onRefresh} />);

    await user.click(screen.getByTitle("Delete"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("delete_provider", { id: "p1" })
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it("cancelled deletion does not call deleteProvider", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const config = { ...mockConfig, actions: [] };
    const user = userEvent.setup();
    render(<ProviderList config={config} onRefresh={onRefresh} />);

    await user.click(screen.getByTitle("Delete"));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // ── Edit provider ─────────────────────────────────────────────────────────

  it("clicking Edit shows ProviderForm with pre-filled name", async () => {
    const user = userEvent.setup();
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByTitle("Edit"));
    expect(screen.getByText("Edit Provider")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Anthropic Claude")).toBeInTheDocument();
  });

  it("submitting edit form calls updateProvider and onRefresh", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderList config={mockConfig} onRefresh={onRefresh} />);

    await user.click(screen.getByTitle("Edit"));
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_provider", expect.anything())
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});
