import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const { default: App } = await import("./App");
import { mockConfig } from "./test/fixtures";

describe("App", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("shows loading state before config is fetched", () => {
    // Never resolves during this test
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the main layout after config loads", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => expect(screen.getByText("LLM Actions")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /providers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
  });

  it("defaults to the Actions tab", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("LLM Actions"));
    // The Actions tab heading appears in the content area
    expect(screen.getAllByText("Actions").length).toBeGreaterThan(0);
  });

  it("shows error state when getConfig rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("disk error"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Failed to load config")).toBeInTheDocument()
    );
    expect(screen.getByText(/disk error/)).toBeInTheDocument();
  });

  it("retry button clears error and calls getConfig again", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("Failed to load config"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByText("LLM Actions")).toBeInTheDocument());
  });

  it("clicking Providers tab shows provider list", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("LLM Actions"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /providers/i }));
    await waitFor(() =>
      expect(screen.getByText("Configure LLM API or CLI providers.")).toBeInTheDocument()
    );
  });

  it("clicking Settings tab shows settings panel", async () => {
    mockInvoke.mockResolvedValue(mockConfig);
    render(<App />);
    await waitFor(() => screen.getByText("LLM Actions"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await waitFor(() =>
      expect(screen.getByText("General application settings.")).toBeInTheDocument()
    );
  });
});
