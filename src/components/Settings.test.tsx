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

  it("renders toggles in their configured initial states", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    expect(
      screen.getByRole("switch", { name: "Show notification on complete" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "Start at login" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", { name: "Enable history" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("renders max tokens select with current value", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("4096");
  });

  it("opens the getting started guide on request", async () => {
    const onShowGuide = vi.fn();
    const user = userEvent.setup();
    render(
      <SettingsPanel
        config={mockConfig}
        onRefresh={onRefresh}
        onShowGuide={onShowGuide}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show Guide" }));
    expect(onShowGuide).toHaveBeenCalledOnce();
  });

  it("explains exactly what enabling history stores", () => {
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);

    expect(
      screen.getByText(/Store up to 100 transformations in plaintext/),
    ).toBeInTheDocument();
    expect(screen.getByText(/including failures/)).toBeInTheDocument();
  });

  it("clicking the toggle changes notification setting and auto-saves", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggle = screen.getByRole("switch", {
      name: "Show notification on complete",
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          showNotificationOnComplete: false,
        }),
      }),
    );
  });

  it("syncs the toggle when config changes", () => {
    const updatedConfig = {
      ...mockConfig,
      settings: {
        ...mockConfig.settings,
        showNotificationOnComplete: false,
      },
    };

    const { rerender } = render(
      <SettingsPanel config={mockConfig} onRefresh={onRefresh} />,
    );

    rerender(<SettingsPanel config={updatedConfig} onRefresh={onRefresh} />);

    expect(
      screen.getByRole("switch", { name: "Show notification on complete" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", { name: "Start at login" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", { name: "Enable history" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("calls onRefresh after successful auto-save", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(
      screen.getByRole("switch", { name: "Show notification on complete" }),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  });

  it("shows error message when save fails", async () => {
    mockInvoke.mockRejectedValue(new Error("write error"));
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    const toggle = screen.getByRole("switch", {
      name: "Show notification on complete",
    });
    await user.click(toggle);
    await waitFor(() =>
      expect(screen.getByText(/write error/)).toBeInTheDocument(),
    );
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("shows non-Error save failures", async () => {
    mockInvoke.mockRejectedValue("write error");
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);

    await user.click(
      screen.getByRole("switch", { name: "Show notification on complete" }),
    );

    await waitFor(() =>
      expect(screen.getByText("write error")).toBeInTheDocument(),
    );
  });

  it("auto-saves when toggling history setting", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("switch", { name: "Enable history" }));
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "save_settings",
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          showNotificationOnComplete: true,
          historyEnabled: false,
        }),
      }),
    );
  });

  it("enables start at login and auto-saves the preference", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);

    const toggle = screen.getByRole("switch", { name: "Start at login" });
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ startAtLogin: true }),
      }),
    );
  });

  it("cancels disabling history without saving", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);

    await user.click(screen.getByRole("switch", { name: "Enable history" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByLabelText("Confirm disabling history"),
    ).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("enables history immediately when it is disabled", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const config = {
      ...mockConfig,
      settings: { ...mockConfig.settings, historyEnabled: false },
    };
    render(<SettingsPanel config={config} onRefresh={onRefresh} />);

    await user.click(screen.getByRole("switch", { name: "Enable history" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ historyEnabled: true }),
      }),
    );
  });

  it("auto-saves when changing max tokens", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPanel config={mockConfig} onRefresh={onRefresh} />);

    await user.selectOptions(screen.getByRole("combobox"), "8192");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ maxTokens: 8192 }),
      }),
    );
  });
});
