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
    expect(
      screen.getByRole("button", { name: /actions/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /providers/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /settings/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /about/i })).toBeInTheDocument();
  });

  it("renders with empty config", async () => {
    mockInvoke.mockResolvedValue(emptyConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));
    expect(screen.getByText("No actions yet")).toBeInTheDocument();
  });

  it("shows guided onboarding for an incomplete first-run config", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_config") {
        return Promise.resolve({
          ...emptyConfig,
          settings: {
            ...emptyConfig.settings,
            onboardingCompleted: false,
          },
        });
      }
      if (cmd === "prepare_apple_provider") {
        return Promise.resolve({ available: false, reason: "not_supported" });
      }
      return Promise.resolve(undefined);
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText("Welcome to Clipwise")).toBeInTheDocument(),
    );
    expect(screen.getByText("1. Copy")).toBeInTheDocument();
    expect(screen.getByText("2. Choose")).toBeInTheDocument();
    expect(screen.getByText("3. Paste")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish Setup" })).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /set up provider/i }),
      ).toBeInTheDocument(),
    );
  });

  it("opens the existing action editor with the chosen onboarding template", async () => {
    const config = {
      ...mockConfig,
      actions: [],
      settings: { ...mockConfig.settings, onboardingCompleted: false },
    };
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_config") return Promise.resolve(config);
      if (cmd === "prepare_apple_provider") {
        return Promise.resolve({ available: false, reason: "not_supported" });
      }
      return Promise.resolve(undefined);
    });

    render(<App />);
    await waitFor(() => screen.getByText("Welcome to Clipwise"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Improve writing" }));

    expect(screen.getByText("New Action")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Improve writing")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        "Improve the writing quality, clarity, and flow of the following text.",
      ),
    ).toBeInTheDocument();
  });

  it("finishes onboarding only after provider and action prerequisites exist", async () => {
    let config = {
      ...mockConfig,
      settings: { ...mockConfig.settings, onboardingCompleted: false },
    };
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_config") return Promise.resolve(config);
      if (cmd === "prepare_apple_provider") {
        return Promise.resolve({ available: false, reason: "not_supported" });
      }
      if (cmd === "save_settings") {
        const settings = (args as { settings: typeof config.settings })
          .settings;
        config = { ...config, settings };
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    render(<App />);
    await waitFor(() => screen.getByText("Welcome to Clipwise"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ onboardingCompleted: true }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Getting Started" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("Actions").length).toBeGreaterThan(0);
  });

  it("reopens the guide from Settings without resetting completion", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByRole("button", { name: "Show Guide" }));
    expect(screen.getByText("Welcome to Clipwise")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "save_settings",
      expect.anything(),
    );
    expect(
      screen.queryByRole("button", { name: "Getting Started" }),
    ).not.toBeInTheDocument();
  });

  // ── Default tab state ─────────────────────────────────────────────────────────

  it("defaults to the Actions tab", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));
    // The Actions tab heading appears in the content area
    expect(screen.getAllByText("Actions").length).toBeGreaterThan(0);
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
    await user.click(screen.getByRole("button", { name: /providers/i }));
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
    await user.click(screen.getByRole("button", { name: /settings/i }));
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
    await user.click(screen.getByRole("button", { name: /history/i }));

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
    await user.click(screen.getByRole("button", { name: /about/i }));

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
      screen.queryByRole("button", { name: /history/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Actions content when active tab is no longer available", async () => {
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
    await user.click(screen.getByRole("button", { name: /history/i }));
    await waitFor(() => screen.getByText("No history yet"));
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByRole("switch", { name: /enable history/i }));
    await user.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /history/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("switching tabs persists active tab state", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    const user = userEvent.setup();

    // Switch to providers
    await user.click(screen.getByRole("button", { name: /providers/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Configure LLM API or CLI providers."),
      ).toBeInTheDocument(),
    );

    // Switch back to actions
    await user.click(screen.getByRole("button", { name: /actions/i }));
    await waitFor(() => screen.getAllByText("Actions").length > 1);

    // Switch to settings tab
    await user.click(screen.getByRole("button", { name: /settings/i }));
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

    // Tab buttons should not be visible in error state
    expect(
      screen.queryByRole("button", { name: /actions/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the app visible when a settings refresh fails", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_config") {
        return mockInvoke.mock.calls.filter(([name]) => name === "get_config")
          .length === 1
          ? Promise.resolve(mockConfig)
          : Promise.reject(new Error("refresh failed"));
      }
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => screen.getByText("Clipwise"));

    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(
      screen.getByRole("switch", { name: /show notification on complete/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("Failed to refresh config")).toBeInTheDocument(),
    );
    expect(screen.getByText("refresh failed")).toBeInTheDocument();
    expect(screen.getByText("Clipwise")).toBeInTheDocument();
  });
});
