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
    expect(
      screen.getByText("General application settings."),
    ).toBeInTheDocument();
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

  it("clicking the toggle changes notification setting", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    await user.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-checked", "false");
  });

  it("syncs the toggle when config changes", () => {
    const { rerender } = render(
      <SettingsPanel config={mockConfig} onRefresh={onRefresh} />,
    );

    rerender(
      <SettingsPanel
        config={{
          ...mockConfig,
          settings: {
            ...mockConfig.settings,
            showNotificationOnComplete: false,
          },
        }}
        onRefresh={onRefresh}
      />,
    );

    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]).toHaveAttribute("aria-checked", "false");
    expect(toggles[1]).toHaveAttribute("aria-checked", "true");
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
        settings: {
          showNotificationOnComplete: true,
          maxTokens: 4096,
          historyEnabled: true,
        },
      }),
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
    await waitFor(() =>
      expect(
        screen.getByText("Settings saved successfully."),
      ).toBeInTheDocument(),
    );
  });

  it("shows error message when save fails", async () => {
    mockInvoke.mockRejectedValue(new Error("write error"));
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() =>
      expect(screen.getByText(/write error/)).toBeInTheDocument(),
    );
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
    expect(
      screen.getByText("LLM Actions", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/After configuring your actions, copy text/i),
    ).toBeInTheDocument();
    expect(screen.getByText("(c) 2026 Andrew Mok")).toBeInTheDocument();
  });

  it("saves updated notification setting after toggling", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    await user.click(toggles[0]);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          showNotificationOnComplete: false,
          historyEnabled: true,
        }),
      }),
    );
  });

  it("can toggle history enabled setting", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggles = screen.getAllByRole("switch");
    // Second toggle is history enabled
    await user.click(toggles[1]);
    await user.click(screen.getByRole("button", { name: /save settings/i }));
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
