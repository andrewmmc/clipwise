import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const { default: App } = await import("./App");
import { mockConfig, emptyConfig } from "./test/fixtures";

describe("App", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  // ── Loading state ─────────────────────────────────────────────────────────────

  it("shows loading state before config is fetched", () => {
    // Never resolves during this test
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the main layout after config loads", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Clipwise")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^Run$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Actions$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Providers$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Settings$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^About$/i }),
    ).toBeInTheDocument();
  });

  it("renders with empty config", async () => {
    mockInvoke.mockResolvedValue(emptyConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));
    expect(screen.getByText("No actions configured")).toBeInTheDocument();
  });

  // ── Default tab state ─────────────────────────────────────────────────────────

  it("defaults to the Run tab", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));
    expect(
      screen.getByPlaceholderText(/paste or type the text/i),
    ).toBeInTheDocument();
  });

  // ── Error state ───────────────────────────────────────────────────────────────

  it("shows error state when getConfig rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("disk error"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Failed to load config")).toBeInTheDocument(),
    );
    expect(screen.getByText(/disk error/)).toBeInTheDocument();
  });

  it("shows error with non-Error rejection", async () => {
    mockInvoke.mockRejectedValue("string error");
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Failed to load config")).toBeInTheDocument(),
    );
    expect(screen.getByText("string error")).toBeInTheDocument();
  });

  it("retry button clears error and calls getConfig again", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Failed to load config"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(screen.getByText("Clipwise")).toBeInTheDocument(),
    );
  });

  it("retry button with subsequent failure shows new error", async () => {
    const error1 = new Error("first failure");
    const error2 = new Error("second failure");
    mockInvoke.mockRejectedValueOnce(error1).mockRejectedValueOnce(error2);
    render(<App />);
    await waitFor(() => screen.getByText("first failure"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => screen.getByText("second failure"));
    expect(screen.getByText("second failure")).toBeInTheDocument();
  });

  // ── Tab switching ─────────────────────────────────────────────────────────────

  it("clicking Providers tab shows provider list", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Providers$/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Configure LLM API or CLI providers."),
      ).toBeInTheDocument(),
    );
  });

  it("clicking Settings tab shows settings panel", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Settings$/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Show notification on complete"),
      ).toBeInTheDocument(),
    );
  });

  it("clicking History tab shows history panel", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_config") {
        return Promise.resolve(mockConfig);
      }
      if (cmd === "get_history") {
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^History$/i }));

    await waitFor(() =>
      expect(screen.getByText("No history yet")).toBeInTheDocument(),
    );
  });

  it("clicking About tab shows about panel", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_config") {
        return Promise.resolve(mockConfig);
      }
      if (cmd === "get_app_info") {
        return Promise.resolve({ version: "1.2.3", commit_hash: null });
      }
      if (cmd === "is_cli_provider_enabled") {
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    });
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^About$/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/macOS text transformation via LLM APIs/),
      ).toBeInTheDocument(),
    );
  });

  it("omits history tab when history is disabled", async () => {
    mockInvoke.mockResolvedValue({
      ...mockConfig,
      settings: { ...mockConfig.settings, historyEnabled: false },
    });

    render(<App />);

    await waitFor(() => screen.getByText("Clipwise"));
    expect(
      screen.queryByRole("button", { name: /^History$/i }),
    ).not.toBeInTheDocument();
  });

  it("removes history tab when history is disabled from settings", async () => {
    const disabledHistoryConfig = {
      ...mockConfig,
      settings: { ...mockConfig.settings, historyEnabled: false },
    };
    let currentConfig = mockConfig;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_config") {
        return Promise.resolve(currentConfig);
      }
      if (cmd === "get_history") {
        return Promise.resolve([]);
      }
      if (cmd === "save_settings") {
        expect(args).toEqual({
          settings: expect.objectContaining({ historyEnabled: false }),
        });
        currentConfig = disabledHistoryConfig;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^History$/i }));
    await waitFor(() => screen.getByText("No history yet"));
    await user.click(screen.getByRole("button", { name: /^Settings$/i }));
    await user.click(screen.getByRole("switch", { name: /enable history/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^History$/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^Run$/i })).toBeInTheDocument();
  });

  it("switching tabs persists active tab state", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    const user = userEvent.setup();

    // Switch to providers
    await user.click(screen.getByRole("button", { name: /^Providers$/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Configure LLM API or CLI providers."),
      ).toBeInTheDocument(),
    );

    // Switch back to run
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/paste or type the text/i),
      ).toBeInTheDocument(),
    );

    // Switch to settings tab
    await user.click(screen.getByRole("button", { name: /^Settings$/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Show notification on complete"),
      ).toBeInTheDocument(),
    );
  });

  // ── Config refresh ────────────────────────────────────────────────────────────

  it("initial load calls getConfig on mount", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));
    expect(mockInvoke).toHaveBeenCalledWith("get_config");
  });

  it("error state does not show tab navigation", async () => {
    mockInvoke.mockRejectedValue(new Error("load failed"));
    render(<App />);
    await waitFor(() => screen.getByText("Failed to load config"));

    expect(
      screen.queryByRole("button", { name: /^Run$/i }),
    ).not.toBeInTheDocument();
  });
});
