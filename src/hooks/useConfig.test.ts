import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriCommands } from "../lib/tauri";
import { emptyConfig, mockConfig } from "../test/fixtures";
import useConfig from "./useConfig";

vi.mock("../lib/tauri", () => ({
  tauriCommands: { getConfig: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores an older refresh that resolves after a newer one", async () => {
    const initial = deferred<typeof mockConfig>();
    const newer = deferred<typeof mockConfig>();
    vi.mocked(tauriCommands.getConfig)
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useConfig());

    act(() => void result.current.refresh());
    await act(async () => newer.resolve(mockConfig));
    await waitFor(() => expect(result.current.config).toEqual(mockConfig));

    await act(async () => initial.resolve(emptyConfig));
    expect(result.current.config).toEqual(mockConfig);
  });

  it("keeps valid config visible when a background refresh fails", async () => {
    vi.mocked(tauriCommands.getConfig)
      .mockResolvedValueOnce(mockConfig)
      .mockRejectedValueOnce(new Error("refresh failed"));
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(mockConfig));

    await act(async () => void (await result.current.refresh()));

    expect(result.current.config).toEqual(mockConfig);
    expect(result.current.error).toBe("refresh failed");
  });

  it("clears a transient refresh error after a successful retry", async () => {
    vi.mocked(tauriCommands.getConfig)
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(mockConfig);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.error).toBe("temporary"));

    await act(async () => void (await result.current.refresh()));

    expect(result.current.error).toBeNull();
    expect(result.current.config).toEqual(mockConfig);
  });
});
