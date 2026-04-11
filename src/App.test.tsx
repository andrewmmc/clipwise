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
      expect(screen.getByText("LLM Actions")).toBeInTheDocument(),
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
    await waitFor(() => screen.getByText("LLM Actions"));
    expect(screen.getByText("No actions yet")).toBeInTheDocument();
  });

  // ── Default tab state ─────────────────────────────────────────────────────────

  it("defaults to the Actions tab", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("LLM Actions"));
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
      expect(screen.getByText("LLM Actions")).toBeInTheDocument(),
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
    await waitFor(() => screen.getByText("LLM Actions"));

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
    await waitFor(() => screen.getByText("LLM Actions"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Show notification on complete"),
      ).toBeInTheDocument(),
    );
  });

  it("switching tabs persists active tab state", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("LLM Actions"));

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
    await waitFor(() => screen.getByText("LLM Actions"));
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
});
