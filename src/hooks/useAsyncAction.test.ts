import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useAsyncAction from "./useAsyncAction";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useAsyncAction", () => {
  it("stays pending until every overlapping action settles", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const { result } = renderHook(() => useAsyncAction());

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.run(() => first.promise);
      secondRun = result.current.run(() => second.promise);
    });
    expect(result.current.pending).toBe(true);

    await act(async () => first.resolve());
    await firstRun;
    expect(result.current.pending).toBe(true);

    await act(async () => second.resolve());
    await secondRun;
    expect(result.current.pending).toBe(false);
  });

  it("does not let an older failure replace newer feedback", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const { result } = renderHook(() => useAsyncAction());

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.run(() => first.promise);
      secondRun = result.current.run(() => second.promise);
    });

    const secondRejection = expect(secondRun).rejects.toThrow("newer failure");
    await act(async () => {
      second.reject(new Error("newer failure"));
      await secondRejection;
    });
    await waitFor(() => expect(result.current.error).toBe("newer failure"));

    const firstRejection = expect(firstRun).rejects.toThrow("older failure");
    await act(async () => {
      first.reject(new Error("older failure"));
      await firstRejection;
    });
    expect(result.current.error).toBe("newer failure");
  });
});
