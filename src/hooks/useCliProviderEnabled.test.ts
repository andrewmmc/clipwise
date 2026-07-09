import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { tauriCommands } from "../lib/tauri";
import useCliProviderEnabled from "./useCliProviderEnabled";

vi.mock("../lib/tauri", () => ({
  tauriCommands: { isCliProviderEnabled: vi.fn() },
}));

describe("useCliProviderEnabled", () => {
  it("defaults to true before the check resolves", () => {
    vi.mocked(tauriCommands.isCliProviderEnabled).mockReturnValue(
      new Promise(() => {}),
    );
    const { result } = renderHook(() => useCliProviderEnabled());
    expect(result.current).toBe(true);
  });

  it("updates to the resolved value", async () => {
    vi.mocked(tauriCommands.isCliProviderEnabled).mockResolvedValue(false);
    const { result } = renderHook(() => useCliProviderEnabled());

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("falls back to false when the check rejects", async () => {
    vi.mocked(tauriCommands.isCliProviderEnabled).mockRejectedValue(
      new Error("nope"),
    );
    const { result } = renderHook(() => useCliProviderEnabled());

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("ignores a resolved value after unmount", async () => {
    let resolve: (value: boolean) => void = () => {};
    vi.mocked(tauriCommands.isCliProviderEnabled).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result, unmount } = renderHook(() => useCliProviderEnabled());

    unmount();
    await act(async () => {
      resolve(false);
      await Promise.resolve();
    });

    // Unmounted before resolution: the hook's guard should have skipped
    // setEnabled, so the last rendered value stays at the initial default.
    expect(result.current).toBe(true);
  });
});
