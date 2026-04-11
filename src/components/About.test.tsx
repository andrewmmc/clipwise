import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

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
});
