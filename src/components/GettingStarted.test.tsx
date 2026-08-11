import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyConfig, mockAction } from "../test/fixtures";
import type { AppConfig } from "../types/config";
import GettingStarted from "./GettingStarted";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const appleConfig: AppConfig = {
  providers: [
    {
      id: "apple-intelligence",
      name: "Apple Intelligence",
      type: "apple",
      headers: {},
      args: [],
    },
  ],
  actions: [{ ...mockAction, providerId: "apple-intelligence" }],
  settings: { ...emptyConfig.settings, onboardingCompleted: false },
};

describe("GettingStarted", () => {
  const onRefresh = vi.fn<() => Promise<void>>();
  const onSetupProvider = vi.fn();
  const onChoosePreset = vi.fn();
  const onFinish = vi.fn<() => Promise<void>>();
  const onDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onRefresh.mockResolvedValue(undefined);
    onFinish.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  function renderGuide(config: AppConfig = emptyConfig) {
    return render(
      <GettingStarted
        config={config}
        reviewMode={false}
        onRefresh={onRefresh}
        onSetupProvider={onSetupProvider}
        onChoosePreset={onChoosePreset}
        onFinish={onFinish}
        onDone={onDone}
      />,
    );
  }

  it("uses an existing Apple provider without preparing another one", () => {
    renderGuide(appleConfig);

    expect(
      screen.getByText("Apple Intelligence is ready to use."),
    ).toBeInTheDocument();
    expect(screen.getByText("Everything is ready.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("prepare_apple_provider");
  });

  it("shows preparation errors and allows manual provider setup", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Apple model check failed"));
    renderGuide();

    expect(
      await screen.findByText("Apple model check failed"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Set Up Provider" }),
    );
    expect(onSetupProvider).toHaveBeenCalledOnce();
  });

  it("ignores Apple preparation failures after unmount", async () => {
    let rejectPreparation!: (reason: Error) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectPreparation = reject;
      }),
    );
    const { unmount } = renderGuide();

    unmount();
    await act(async () => {
      rejectPreparation(new Error("late failure"));
      await Promise.resolve();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ignores successful Apple preparation after unmount", async () => {
    let resolvePreparation!: (availability: {
      available: boolean;
      reason: null;
    }) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreparation = resolve;
      }),
    );
    const { unmount } = renderGuide();

    unmount();
    await act(async () => {
      resolvePreparation({ available: true, reason: null });
      await Promise.resolve();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("reports a failure while finishing setup", async () => {
    let rejectFinish!: (reason: Error) => void;
    onFinish.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectFinish = reject;
      }),
    );
    renderGuide(appleConfig);

    await userEvent.click(screen.getByRole("button", { name: "Finish Setup" }));
    expect(screen.getByText("Finishing…")).toBeInTheDocument();

    await act(async () => {
      rejectFinish(new Error("Could not save setup"));
    });

    await waitFor(() =>
      expect(screen.getByText("Could not save setup")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Finish Setup" })).toBeEnabled();
  });
});
