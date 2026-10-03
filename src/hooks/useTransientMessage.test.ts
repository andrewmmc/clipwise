import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useTransientMessage from "./useTransientMessage";

describe("useTransientMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the message automatically after the duration elapses", () => {
    const { result } = renderHook(() => useTransientMessage(1000));

    act(() => {
      result.current.showMessage("Saved.");
    });
    expect(result.current.message).toBe("Saved.");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.message).toBeNull();
  });

  it("restarts the timer when showMessage is called again before it elapses", () => {
    const { result } = renderHook(() => useTransientMessage(1000));

    act(() => {
      result.current.showMessage("First");
    });
    act(() => {
      vi.advanceTimersByTime(600);
      result.current.showMessage("Second");
    });
    expect(result.current.message).toBe("Second");

    // Only 600ms have passed since the second call; the first timer should
    // have been cancelled and not fire early.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.message).toBe("Second");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.message).toBeNull();
  });

  it("clearMessage cancels a pending auto-clear timeout", () => {
    const { result } = renderHook(() => useTransientMessage(1000));

    act(() => {
      result.current.showMessage("Saved.");
      result.current.clearMessage();
    });
    expect(result.current.message).toBeNull();

    // Advancing time should not throw or otherwise misbehave now that the
    // timeout was already cleared.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.message).toBeNull();
  });

  it("clears the pending timeout on unmount", () => {
    const { result, unmount } = renderHook(() => useTransientMessage(1000));

    act(() => {
      result.current.showMessage("Saved.");
    });

    expect(() => {
      unmount();
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
  });
});
