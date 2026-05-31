import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const mockOpenUrl = vi.mocked(openUrl);

const { default: AboutPanel } = await import("./About");

describe("AboutPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_app_info") {
        return Promise.resolve({ version: "1.2.3", commit_hash: "abc123def" });
      }
      return Promise.resolve(undefined);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("displays version and commit hash from backend", async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
      expect(screen.getByText(/\(abc123def\)/)).toBeInTheDocument();
    });
  });

  it("displays version without commit hash when not available", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_app_info") {
        return Promise.resolve({ version: "1.0.0", commit_hash: null });
      }
      return Promise.resolve(undefined);
    });
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<AboutPanel />);
    expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
  });

  it("displays app description", async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(
        screen.getByText(/macOS text transformation via LLM APIs/),
      ).toBeInTheDocument();
    });
  });

  it("shows Mac App Store version when CLI providers are disabled", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_app_info") {
        return Promise.resolve({ version: "1.0.0", commit_hash: null });
      }
      if (cmd === "is_cli_provider_enabled") {
        return Promise.resolve(false);
      }
      return Promise.resolve(undefined);
    });

    render(<AboutPanel />);

    await waitFor(() => {
      expect(screen.getByText("Mac App Store version")).toBeInTheDocument();
    });
  });

  it("opens external links", async () => {
    const user = userEvent.setup();
    render(<AboutPanel />);

    await user.click(screen.getByRole("button", { name: "Website" }));
    await user.click(screen.getByRole("button", { name: "GitHub" }));
    await user.click(screen.getByRole("button", { name: "Privacy Policy" }));
    await user.click(screen.getByRole("button", { name: "Andrew Mok" }));

    expect(mockOpenUrl).toHaveBeenCalledWith("https://clipwise.mmc.dev");
    expect(mockOpenUrl).toHaveBeenCalledWith(
      "https://github.com/andrewmmc/clipwise",
    );
    expect(mockOpenUrl).toHaveBeenCalledWith(
      "https://clipwise.mmc.dev/privacy",
    );
    expect(mockOpenUrl).toHaveBeenCalledWith("https://andrewmmc.com/");
  });
});
