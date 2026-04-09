import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const { default: SettingsPanel } = await import("./Settings");
import { mockConfig } from "../test/fixtures";

describe("SettingsPanel", () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onRefresh.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the settings heading", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("General application settings.")).toBeInTheDocument();
  });

  it("renders the notification toggle in correct initial state", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("renders max tokens input with current value", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(4096);
  });

  it("clicking the toggle changes notification setting", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggle = screen.getByRole("switch");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("changing max tokens input updates the value", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const input = screen.getByRole("spinbutton");
    await user.tripleClick(input);
    await user.keyboard("2048");
    expect(input).toHaveValue(2048);
  });

  it("save button calls saveSettings with current values", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: { showNotificationOnComplete: true, maxTokens: 4096 },
      })
    );
  });

  it("calls onRefresh after successful save", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  });

  it("shows saved confirmation after successful save", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(screen.getByText("✓ Saved")).toBeInTheDocument());
  });

  it("shows error message when save fails", async () => {
    mockInvoke.mockRejectedValue(new Error("write error"));
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(screen.getByText(/write error/)).toBeInTheDocument());
  });

  it("save button is disabled while saving", async () => {
    // Never resolves — keeps button in saving state
    mockInvoke.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("renders the About section", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText(/LLM Actions/)).toBeInTheDocument();
  });

  it("saves updated notification setting after toggling", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ showNotificationOnComplete: false }),
      })
    );
  });
});
