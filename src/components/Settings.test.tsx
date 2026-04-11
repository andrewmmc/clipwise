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

  it("renders the notification toggle in correct initial state", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    // First toggle is showNotificationOnComplete
    expect(toggles[0]).toHaveAttribute("aria-checked", "true");
    // Second toggle is historyEnabled
    expect(toggles[1]).toHaveAttribute("aria-checked", "true");
  });

  it("renders max tokens input with current value", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(4096);
  });

  it("clicking the toggle changes notification setting and auto-saves", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    await user.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-checked", "false");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          showNotificationOnComplete: false,
        }),
      }),
    );
  });

  it("syncs the toggle when config changes via key-based remount", () => {
    const updatedConfig = {
      ...mockConfig,
      settings: {
        ...mockConfig.settings,
        showNotificationOnComplete: false,
      },
    };

    const { rerender } = render(
      <SettingsPanel
        key={JSON.stringify(mockConfig.settings)}
        config={mockConfig}
        onRefresh={onRefresh}
      />,
    );

    // Rerender with new key to trigger remount (as App.tsx does)
    rerender(
      <SettingsPanel
        key={JSON.stringify(updatedConfig.settings)}
        config={updatedConfig}
        onRefresh={onRefresh}
      />,
    );

    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]).toHaveAttribute("aria-checked", "false");
    expect(toggles[1]).toHaveAttribute("aria-checked", "true");
  });

  it("calls onRefresh after successful auto-save", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    await user.click(toggles[0]);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  });

  it("shows error message when save fails", async () => {
    mockInvoke.mockRejectedValue(new Error("write error"));
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    await user.click(toggles[0]);
    await waitFor(() =>
      expect(screen.getByText(/write error/)).toBeInTheDocument(),
    );
  });

  it("auto-saves when toggling history setting", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    // Second toggle is history enabled
    await user.click(toggles[1]);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          showNotificationOnComplete: true,
          historyEnabled: false,
        }),
      }),
    );
  });
});
